#!/usr/bin/env node
// ACE-Step 1.5 music generator for WHO FIGHTS.
//
//   node tools/music/gen_music.mjs tools/music/jobs.json [--only id,id] [--force] [--dry]
//
// Submits one job at a time (the GPU is a single slot), polls, downloads, then MEASURES the take
// with ffprobe/ffmpeg and rejects silence, near-silence, clipping and short/overlong takes.
// Re-runnable: a job whose mp3 already exists and passes QC is skipped unless --force.
//
// The dev server's POST /api/music can import { generateOne } and reuse the same path.

import { readFile, writeFile, mkdir, stat, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const pexec = promisify(execFile);

export const ACE = process.env.ACE_URL || 'http://localhost:8001';
const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

// QC thresholds. A file existing is not a take succeeding.
const QC = {
  durTol: 0.30,       // measured seconds must be within ±30% of requested
  minPeakDb: -9.0,    // quieter than this = the model gave up
  minRmsDb: -34.0,    // near-silence / ambient wash
  maxPeakDb: 1.0,     // mp3 decode overshoots a little; above this is real clipping
  diedEarlyDb: -20.0, // last fifth this far under the whole-file RMS = the track stopped early
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function post(route, body) {
  const r = await fetch(`${ACE}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${route} ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

export async function submit(job) {
  // ACE-Step wants the long, concrete arrangement description, not the Suno tag-style
  // string. Since the library moved to Suno, `prompt` is the Suno one and `acePrompt`
  // is the local-fallback text; fall back to `prompt` for jobs that never had a Suno take.
  const body = {
    prompt: job.acePrompt || job.prompt,
    lyrics: job.lyrics || '',
    thinking: !!job.lyrics,        // vocals need Phase 1 metadata; instrumentals do not
    audio_duration: job.seconds,
    inference_steps: job.steps || 4,
    batch_size: 1,
    audio_format: 'mp3',
    task_type: 'text2music',
    vocal_language: 'en',
  };
  const res = await post('/release_task', body);
  const id = res?.data?.task_id;
  if (!id) throw new Error(`no task_id: ${JSON.stringify(res).slice(0, 300)}`);
  return id;
}

export async function waitFor(taskId, { timeoutMs = 900_000, onTick } = {}) {
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < timeoutMs) {
    await sleep(2500);
    let d;
    try {
      d = (await post('/query_result', { task_id_list: [taskId] }))?.data?.[0];
    } catch (e) {
      onTick?.(`poll error: ${e.message}`);
      continue;
    }
    if (!d) continue;
    if (d.progress_text && d.progress_text !== last) { last = d.progress_text; onTick?.(last); }
    if (d.status === 1) {
      // `result` comes back as a JSON *string*, not a nested object.
      const arr = typeof d.result === 'string' ? JSON.parse(d.result) : d.result;
      const file = arr?.[0]?.file;
      if (!file) throw new Error(`succeeded with no file: ${JSON.stringify(arr).slice(0, 300)}`);
      return file;
    }
    if (d.status === 2) throw new Error(`generation failed: ${d.progress_text || 'unknown'}`);
  }
  throw new Error(`timed out after ${Math.round(timeoutMs / 1000)}s`);
}

export async function download(fileUrl, outPath) {
  const url = fileUrl.startsWith('http') ? fileUrl : `${ACE}${fileUrl}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 4096) throw new Error(`download is ${buf.length} bytes`);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, buf);
  return buf.length;
}

// `-ss` MUST come before `-i`. Output-side seeking leaves volumedetect measuring the whole file,
// which silently turns the tail check into a duplicate of the whole-file check.
async function volume(file, seek = null, dur = null) {
  const args = ['-v', 'info'];
  if (seek !== null) args.push('-ss', String(seek));
  if (dur !== null) args.push('-t', String(dur));
  args.push('-i', file, '-af', 'volumedetect', '-f', 'null', '-');
  const { stderr } = await pexec('ffmpeg', args).catch(e => ({ stderr: e.stderr || '' }));
  const peak = /max_volume:\s*(-?[\d.]+) dB/.exec(stderr);
  const rms = /mean_volume:\s*(-?[\d.]+) dB/.exec(stderr);
  return {
    peakDb: peak ? parseFloat(peak[1]) : -999,
    rmsDb: rms ? parseFloat(rms[1]) : -999,
  };
}

export async function measure(file) {
  const { stdout } = await pexec('ffprobe', ['-v', 'error', '-show_entries',
    'format=duration', '-of', 'default=nw=1:nk=1', file]);
  const seconds = Math.round(parseFloat(stdout.trim()) * 10) / 10;
  const whole = await volume(file);
  const head = await volume(file, null, 3);
  const tail = await volume(file, Math.max(0, seconds - 3));
  const lastFifth = await volume(file, seconds * 0.8);
  return {
    seconds, ...whole,
    headRmsDb: head.rmsDb,
    tailRmsDb: tail.rmsDb,
    lastFifthRmsDb: lastFifth.rmsDb,
    // How the take finishes. A fade loops cleanly; ABRUPT needs the runtime to fade it out.
    ends: tail.rmsDb - whole.rmsDb < -12 ? 'fade' : 'abrupt',
  };
}

export function qc(m, wantSeconds) {
  const bad = [];
  const lo = wantSeconds * (1 - QC.durTol), hi = wantSeconds * (1 + QC.durTol);
  if (!(m.seconds >= lo && m.seconds <= hi)) bad.push(`duration ${m.seconds}s outside ${lo.toFixed(0)}–${hi.toFixed(0)}s`);
  if (m.peakDb < QC.minPeakDb) bad.push(`peak ${m.peakDb}dB too quiet`);
  if (m.peakDb > QC.maxPeakDb) bad.push(`peak ${m.peakDb}dB clipped`);
  if (m.rmsDb < QC.minRmsDb) bad.push(`RMS ${m.rmsDb}dB near-silent`);
  if (m.lastFifthRmsDb - m.rmsDb < QC.diedEarlyDb)
    bad.push(`last fifth is ${(m.lastFifthRmsDb - m.rmsDb).toFixed(1)}dB under the track — it stopped early`);
  return { pass: bad.length === 0, reasons: bad };
}

export async function generateOne(job, { log = console.log } = {}) {
  const out = path.join(ROOT, 'audio', 'music', `${job.id}.mp3`);
  const t0 = Date.now();
  const taskId = await submit(job);
  log(`  task ${taskId}`);
  const fileUrl = await waitFor(taskId, { onTick: t => log(`  … ${t}`) });
  const bytes = await download(fileUrl, out);
  const m = await measure(out);
  const verdict = qc(m, job.seconds);
  const secs = Math.round((Date.now() - t0) / 1000);
  return { ...job, out, bytes, ...m, ...verdict, wallSeconds: secs };
}

async function exists(p) { try { await stat(p); return true; } catch { return false; } }

async function main() {
  const args = process.argv.slice(2);
  const jobsPath = args.find(a => !a.startsWith('--')) || 'tools/music/jobs.json';
  const only = (args.find(a => a.startsWith('--only=')) || '').split('=')[1]?.split(',');
  const force = args.includes('--force');
  const dry = args.includes('--dry');
  const retries = parseInt((args.find(a => a.startsWith('--retries=')) || '=1').split('=')[1], 10);

  let jobs = JSON.parse(await readFile(path.resolve(ROOT, jobsPath), 'utf8'));
  if (only) jobs = jobs.filter(j => only.includes(j.id));

  const resultsPath = path.join(ROOT, 'tools', 'music', 'results.json');
  const results = await exists(resultsPath)
    ? JSON.parse(await readFile(resultsPath, 'utf8')) : {};

  if (dry) {
    for (const j of jobs) console.log(`${j.id}\t${j.seconds}s\t${j.lyrics ? 'VOCAL' : 'inst '}\t${j.title}`);
    console.log(`\n${jobs.length} jobs, ${jobs.reduce((a, j) => a + j.seconds, 0)}s of audio`);
    return;
  }

  const t0 = Date.now();
  for (const [i, job] of jobs.entries()) {
    const out = path.join(ROOT, 'audio', 'music', `${job.id}.mp3`);
    if (!force && await exists(out) && results[job.id]?.pass) {
      console.log(`[${i + 1}/${jobs.length}] ${job.id} — already done, skipping`);
      continue;
    }
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      console.log(`[${i + 1}/${jobs.length}] ${job.id} (${job.seconds}s${job.lyrics ? ', vocals' : ''})${attempt > 1 ? ` retry ${attempt - 1}` : ''}`);
      try {
        const r = await generateOne(job);
        results[job.id] = r;
        await writeFile(resultsPath, JSON.stringify(results, null, 2));
        if (r.pass) {
          console.log(`  OK ${r.seconds}s peak ${r.peakDb}dB rms ${r.rmsDb}dB (${r.wallSeconds}s wall)`);
          break;
        }
        console.log(`  REJECT: ${r.reasons.join('; ')}`);
        if (attempt > retries) { await unlink(out).catch(() => {}); }
      } catch (e) {
        console.log(`  ERROR: ${e.message}`);
        results[job.id] = { ...job, pass: false, reasons: [e.message] };
        await writeFile(resultsPath, JSON.stringify(results, null, 2));
      }
    }
  }
  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  const ok = Object.values(results).filter(r => r.pass).length;
  console.log(`\nDONE — ${ok}/${Object.keys(results).length} passing, ${mins} min wall`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('gen_music.mjs')) {
  main().catch(e => { console.error(e); process.exit(1); });
}
