// Binary matrix rain — purple/cyan theme (not green)
(function () {
  const canvas = document.getElementById('matrix-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const fontSize = 16;
  let columns = Math.floor(canvas.width / fontSize);
  let drops = new Array(columns).fill(1);

  const colors = ['#8B5CF6', '#B794F6', '#00E5FF', '#6D28D9'];

  function draw() {
    ctx.fillStyle = 'rgba(11, 11, 15, 0.08)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = fontSize + 'px monospace';

    for (let i = 0; i < drops.length; i++) {
      const text = Math.random() > 0.5 ? '1' : '0';
      ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
      ctx.fillText(text, i * fontSize, drops[i] * fontSize);

      if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i]++;
    }
  }

  setInterval(draw, 45);

  window.addEventListener('resize', () => {
    columns = Math.floor(canvas.width / fontSize);
    drops = new Array(columns).fill(1);
  });
})();
