export function newLife(name = 'You') {
  return {
    name, age: 18, xp: 0, stage: 'young', home: 'bench', homeTier: 0,
    partner: null, partnerOffer: null, dogOffer: false,
    kids: [], nextBirthXp: null, dog: null, kidSeq: 0,
  };
}

export function ageStage(age) {
  return age < 30 ? 'young' : age < 45 ? 'adult' : age < 60 ? 'prime' : 'silver';
}

export function kidStage(stages, kidAge) {
  let s = stages[0][0];
  for (const [id, min] of stages) if (kidAge >= min) s = id;
  return s;
}

export function talentOf(kid, lineById) {
  let best = null, sec = 0;
  for (const id in kid.work || {}) if (kid.work[id] > sec) { sec = kid.work[id]; best = id; }
  return best && lineById[best] ? lineById[best].talent : 'dreamer';
}

export function addXp(life, L, n) {
  life.xp += n;
  life.age = Math.min(L.ageMax, Math.round((18 + life.xp * L.xpYears) * 10) / 10);
  life.stage = ageStage(life.age);
}

export function makePartnerOffer(partners, names, rng) {
  const pool = names.slice();
  return {
    choices: partners.map((p) => {
      const name = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      return { ...p, name };
    }),
  };
}

export function bornKids(life) {
  return life.kids.filter((k) => !k.apprentice).length;
}

function newKid(life, name, extra) {
  return {
    id: 'k' + ++life.kidSeq, name, born: life.age, bornXp: life.xp, stage: 'baby', kidAge: 0,
    workedLine: null, workSec: 0, work: {}, talent: 'dreamer', ...extra,
  };
}

export function stepLife(state, data, rng, emit, bestLine) {
  const life = state.life, L = data.life;
  if (!life.partner && life.homeTier >= 2 && !life.partnerOffer) {
    life.partnerOffer = makePartnerOffer(data.partners, data.partnerNames, rng);
    emit('life:offer', { kind: 'partner' });
  }
  if (!life.dog && life.homeTier >= 2 && !life.dogOffer) {
    life.dogOffer = true;
    emit('life:offer', { kind: 'dog' });
  }
  const allowed = L.kidsAt[life.homeTier] || 0, born = bornKids(life);
  if (life.partner && born < allowed) {
    if (life.nextBirthXp == null) life.nextBirthXp = life.xp + (born ? L.birthGap : L.firstBirthGap) / L.xpYears;
    if (life.xp >= life.nextBirthXp) {
      const used = new Set(life.kids.map((k) => k.name));
      const names = data.kidNames.filter((n) => !used.has(n));
      const kid = newKid(life, names[Math.floor(rng() * names.length)] || 'Kid');
      life.kids.push(kid);
      life.nextBirthXp = null;
      addXp(life, L, L.xp.birth);
      emit('life:beat', { kind: 'birth', kidId: kid.id, name: kid.name });
    }
  }
  const noTeen = !life.kids.some((k) => k.stage === 'teen');
  const stuck = !life.kids.length ? life.age >= L.heirAge : life.age >= L.ageMax && noTeen && !life.kids.some((k) => k.apprentice);
  if (stuck && state.districts.includes('harbour')) {
    const used = new Set(life.kids.map((k) => k.name));
    const names = (data.heirNames || ['Dot']).filter((n) => !used.has(n));
    const kid = newKid(life, names[Math.floor(rng() * names.length)] || 'Dot', { apprentice: true });
    kid.bornXp = life.xp - L.kidStages[L.kidStages.length - 1][1] / L.xpYears;
    life.kids.push(kid);
    emit('life:beat', { kind: 'heir', kidId: kid.id, name: kid.name });
  }
  for (const k of life.kids) {
    k.kidAge = Math.max(0, Math.round((life.xp - k.bornXp) * L.xpYears * 10) / 10);
    const st = kidStage(L.kidStages, k.kidAge);
    if (st !== k.stage) {
      k.stage = st;
      emit('life:beat', { kind: 'grow', kidId: k.id, name: k.name, stage: st });
    }
    if ((st === 'kid' || st === 'teen') && !k.workedLine && bestLine) {
      k.workedLine = bestLine;
      emit('life:beat', { kind: 'work', kidId: k.id, lineId: bestLine });
    }
  }
}

export function stepKidWork(state, h, lineById) {
  for (const k of state.life.kids) {
    if (!k.workedLine || (k.stage !== 'kid' && k.stage !== 'teen')) continue;
    k.work[k.workedLine] = (k.work[k.workedLine] || 0) + h;
    k.workSec = k.work[k.workedLine];
    k.talent = talentOf(k, lineById);
  }
}
