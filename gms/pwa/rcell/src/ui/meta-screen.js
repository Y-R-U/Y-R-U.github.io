// meta-screen.js — Between-run upgrade tree screen
const MetaScreen = (() => {
  let scrollY = 0;
  let nodeRects = {};
  let backBtn = null;

  const NODE_R = 28;
  const NODE_GAP_X = 100;
  const NODE_GAP_Y = 110;
  const BRANCH_W = 200;

  function getBranchColor(branchId) {
    const colors = {
      nucleus: '#4af0b0', cytoplasm: '#ff4466',
      membrane: '#44aaff', lab: '#ffd166', evolution: '#a78bfa'
    };
    return colors[branchId] || '#ffffff';
  }

  function draw(ctx, canvasW, canvasH, saveData) {
    // Background
    ctx.fillStyle = '#050d1a';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Header
    ctx.fillStyle = 'rgba(167,139,250,0.15)';
    ctx.fillRect(0, 0, canvasW, 56);
    ctx.fillStyle = '#a78bfa';
    ctx.font = 'bold 20px "Exo 2", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('META UPGRADES', 16, 36);

    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 16px "Exo 2", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`🧬 ${saveData ? saveData.dnaPoints : 0} DNA`, canvasW - 16, 36);

    const branches = MetaUpgrades.getBranches();
    nodeRects = {};

    // Draw each branch as a column
    branches.forEach((branch, bIdx) => {
      const locked = branch.requiresWin && !(saveData && saveData.hasWon);
      const color = getBranchColor(branch.id);
      const bx = 20 + bIdx * BRANCH_W;

      // Branch header
      ctx.fillStyle = locked ? 'rgba(255,255,255,0.2)' : color;
      ctx.font = 'bold 13px "Exo 2", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${branch.emoji} ${branch.name}`, bx + BRANCH_W / 2, 78 + scrollY);

      if (locked) {
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '11px "Nunito", sans-serif';
        ctx.fillText('(Win first)', bx + BRANCH_W / 2, 94 + scrollY);
      }

      // Draw connection lines first
      branch.nodes.forEach((node, nIdx) => {
        const nx = bx + BRANCH_W / 2;
        const ny = 110 + nIdx * NODE_GAP_Y + scrollY;
        node.requires.forEach(reqId => {
          const reqNode = MetaUpgrades.getNode(reqId);
          if (reqNode) {
            const reqBranch = MetaUpgrades.getBranches().find(b => b.id === reqNode.branch);
            if (reqBranch) {
              const reqBIdx = branches.indexOf(reqBranch);
              const reqNIdx = reqBranch.nodes.findIndex(n => n.id === reqId);
              const rx = 20 + reqBIdx * BRANCH_W + BRANCH_W / 2;
              const ry = 110 + reqNIdx * NODE_GAP_Y + scrollY;
              const unlocked = MetaUpgrades.isUnlocked(node.id);
              const reqUnlocked = MetaUpgrades.isUnlocked(reqId);
              ctx.beginPath();
              ctx.moveTo(rx, ry + NODE_R);
              ctx.lineTo(nx, ny - NODE_R);
              ctx.strokeStyle = unlocked ? color : reqUnlocked ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)';
              ctx.lineWidth = 2;
              ctx.stroke();
            }
          }
        });
      });

      // Draw nodes
      branch.nodes.forEach((node, nIdx) => {
        const nx = bx + BRANCH_W / 2;
        const ny = 110 + nIdx * NODE_GAP_Y + scrollY;
        const unlocked = MetaUpgrades.isUnlocked(node.id);
        const canUnlock = MetaUpgrades.canUnlock(node.id);
        const cost = MetaUpgrades.getEffectiveCost(node.id);

        nodeRects[node.id] = { x: nx - NODE_R, y: ny - NODE_R, r: NODE_R };

        // Node circle
        ctx.beginPath();
        ctx.arc(nx, ny, NODE_R, 0, Math.PI * 2);
        if (unlocked) {
          ctx.fillStyle = color;
        } else if (locked) {
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
        } else if (canUnlock) {
          ctx.fillStyle = `${color}33`;
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
        }
        ctx.fill();

        ctx.strokeStyle = unlocked ? color : canUnlock ? `${color}88` : 'rgba(255,255,255,0.15)';
        ctx.lineWidth = unlocked ? 3 : 1.5;
        if (unlocked) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 12;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Icon/abbreviation
        ctx.fillStyle = unlocked ? '#050d1a' : canUnlock ? color : 'rgba(255,255,255,0.3)';
        ctx.font = `bold ${NODE_R > 24 ? 10 : 9}px "Exo 2", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = node.name.split(' ').map(w => w[0]).join('').slice(0, 4);
        ctx.fillText(label, nx, ny);
        ctx.textBaseline = 'alphabetic';

        // Node name below
        ctx.fillStyle = unlocked ? color : 'rgba(255,255,255,0.5)';
        ctx.font = `${unlocked ? 'bold ' : ''}10px "Nunito", sans-serif`;
        ctx.textAlign = 'center';
        const nameWords = node.name.split(' ');
        ctx.fillText(nameWords[0], nx, ny + NODE_R + 14);
        if (nameWords[1]) ctx.fillText(nameWords.slice(1).join(' '), nx, ny + NODE_R + 26);

        // Cost
        if (!unlocked && !locked) {
          const hasDNA = saveData && saveData.dnaPoints >= cost;
          ctx.fillStyle = hasDNA ? '#ffd166' : 'rgba(255,209,102,0.4)';
          ctx.font = '10px "Exo 2", sans-serif';
          ctx.fillText(`${cost}🧬`, nx, ny + NODE_R + 38);
        }
      });
    });

    // Back button
    const backY = canvasH - 60;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    _roundRect(ctx, canvasW / 2 - 60, backY, 120, 40, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    _roundRect(ctx, canvasW / 2 - 60, backY, 120, 40, 10);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px "Exo 2", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('← BACK', canvasW / 2, backY + 26);
    backBtn = { x: canvasW / 2 - 60, y: backY, w: 120, h: 40 };
  }

  function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function handleTap(tapX, tapY, saveData) {
    // Back button
    if (backBtn && tapX >= backBtn.x && tapX <= backBtn.x + backBtn.w &&
        tapY >= backBtn.y && tapY <= backBtn.y + backBtn.h) {
      return 'back';
    }

    // Node taps
    for (const [nodeId, rect] of Object.entries(nodeRects)) {
      const dx = tapX - (rect.x + rect.r);
      const dy = tapY - (rect.y + rect.r);
      if (dx * dx + dy * dy < rect.r * rect.r) {
        const result = MetaUpgrades.unlock(nodeId);
        if (result.success) {
          Audio.sfx.upgrade();
          Storage.save(saveData);
          return 'upgraded';
        } else {
          // Show feedback (could pulse the node)
          return 'failed';
        }
      }
    }
    return null;
  }

  function handleScroll(dy) {
    scrollY = Math.min(0, scrollY + dy);
  }

  return { draw, handleTap, handleScroll };
})();
