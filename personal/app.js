(() => {
  const S = window.SITE;
  const $ = (id) => document.getElementById(id);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  /* ---------- content ---------- */
  $('heroName').textContent = S.name + '.';
  $('year').textContent = new Date().getFullYear();

  const litWords = new Set(['חלל', 'חוקר', 'רעיון', 'נתונים', 'טיול', 'טיולים', 'הבלוג', 'באמת']);
  const lit = $('lit');
  S.about.join(' ').split(/\s+/).forEach((w) => {
    const span = document.createElement('span');
    const bare = w.replace(/[.,—:\-]/g, '').replace(/^[בלהו](?=\S{3,})/, '');
    if (litWords.has(bare) || litWords.has(w.replace(/[.,]/g, ''))) span.classList.add('hl');
    span.textContent = w + ' ';
    lit.appendChild(span);
  });

  $('carousel').innerHTML = S.journey
    .map((j) => `<article class="tile card">
        <p class="yr grad">${j.year}</p>
        <p class="place">${j.place}</p>
        <h3>${j.title}</h3>
        <p>${j.text}</p>
      </article>`)
    .join('');

  $('projectList').innerHTML = S.projects
    .map((p) => `<article class="tile proj reveal">
        <h3>${p.title}</h3>
        <p class="desc">${p.text}</p>
        <div class="links"><a href="${p.url}">לכניסה ›</a></div>
        <div class="ico" aria-hidden="true">${p.icon}</div>
        <p class="tags">${p.tags.join(' · ')}</p>
      </article>`)
    .join('');

  const mail = $('mailLink');
  mail.href = `mailto:${S.email}`;
  $('mailText').textContent = S.email;
  $('phoneLink').href = `tel:${S.phoneIntl}`;
  $('phoneText').textContent = S.phone;
  $('waLink').href = `https://wa.me/${S.phoneIntl.replace('+', '')}`;
  $('liLink').href = S.linkedin;
  $('blogLink').href = S.blog;

  /* ---------- typed subtitle ---------- */
  const phrases = [S.tagline, 'סקרן. יוצר. חוקר.', 'נתונים, טיולים ורעיונות גדולים.'];
  const typed = $('typed');
  if (reduced) typed.textContent = phrases[0];
  else {
    let pi = 0, ci = 0, del = false;
    const step = () => {
      const t = phrases[pi];
      ci += del ? -1 : 1;
      typed.textContent = t.slice(0, ci);
      let wait = del ? 28 : 55;
      if (!del && ci === t.length) { del = true; wait = 2200; }
      else if (del && ci === 0) { del = false; pi = (pi + 1) % phrases.length; wait = 400; }
      setTimeout(step, wait);
    };
    setTimeout(step, 600);
  }

  /* ---------- mission clock ---------- */
  const [by, bm, bd] = S.birthDate.split('-').map(Number);
  const birth = new Date(by, bm - 1, bd);
  const fmt = new Intl.NumberFormat('he-IL');
  const ageOn = (now) => {
    let a = now.getFullYear() - by;
    if (now < new Date(now.getFullYear(), bm - 1, bd)) a--;
    return a;
  };
  let countedUp = false;
  const tickClock = () => {
    const now = new Date();
    const ms = now - birth;
    const age = ageOn(now);
    $('cDays').textContent = fmt.format(Math.floor(ms / 864e5));
    $('cSecs').textContent = fmt.format(Math.floor(ms / 1e3));
    $('cKm').textContent = fmt.format(Math.floor((ms / 1e3) * 29.78));
    if (!countedUp) $('cYears').textContent = age;
    $('heroYears').textContent = age;

    const last = new Date(by + age, bm - 1, bd);
    const next = new Date(by + age + 1, bm - 1, bd);
    $('nextAge').textContent = age + 1;
    $('bdayDays').textContent = Math.ceil((next - now) / 864e5);
    $('bdayRing').dataset.frac = (now - last) / (next - last);
  };
  tickClock();
  setInterval(tickClock, 1000);

  // count-up when the numbers section appears
  const countUp = (el, to) => {
    const t0 = performance.now();
    const f = (t) => {
      const k = clamp((t - t0) / 1600);
      el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  };

  /* ---------- reveal on scroll ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      if (e.target.classList.contains('t-big') && !countedUp) {
        countedUp = true;
        if (!reduced) countUp($('cYears'), ageOn(new Date()));
      }
      if (e.target.classList.contains('t-ring')) {
        const ring = $('bdayRing');
        ring.style.strokeDashoffset = 326.7 * (1 - Number(ring.dataset.frac || 0));
      }
      io.unobserve(e.target);
    });
  }, { threshold: 0.15 });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  // active nav link
  const links = [...document.querySelectorAll('.gnav-links a')];
  const navIo = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) links.forEach((a) => a.classList.toggle('active', a.hash === '#' + e.target.id));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  document.querySelectorAll('main section[id]').forEach((s) => navIo.observe(s));

  /* ---------- scroll-driven scenes ---------- */
  const heroScene = $('home');
  const heroCopy = $('heroCopy');
  const planet = $('planetWrap');
  const outro = $('heroOutro');
  const litSpans = [...lit.children];
  let scrollY = window.scrollY;

  const onScroll = () => {
    scrollY = window.scrollY;
    const vh = innerHeight;

    // hero: title lifts away, planet grows toward you, outro line fades in
    const r = heroScene.getBoundingClientRect();
    const p = clamp(-r.top / (r.height - vh));
    heroCopy.style.opacity = 1 - clamp(p * 2.6);
    heroCopy.style.transform = `translateY(${-p * 180}px) scale(${1 - p * 0.15})`;
    planet.style.transform = `translateY(${-p * 12}vh) scale(${1 + p * 1.5}) rotate(${p * 25}deg)`;
    planet.style.opacity = 1 - clamp((p - 0.7) * 3);
    const o = clamp((p - 0.45) * 4);
    outro.style.opacity = o;
    outro.style.transform = `translateY(${(1 - o) * 30}px)`;

    // about: words light up one by one as the paragraph passes the viewport middle
    const lr = lit.getBoundingClientRect();
    const lp = clamp((vh * 0.8 - lr.top) / (lr.height + vh * 0.3));
    const n = Math.floor(lp * litSpans.length);
    litSpans.forEach((s, i) => s.classList.toggle('on', i < n));
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();

  /* ---------- carousel buttons (RTL: forward = negative scrollLeft) ---------- */
  const car = $('carousel');
  const stepW = () => (car.querySelector('.card')?.offsetWidth || 300) + 20;
  $('carNext').onclick = () => car.scrollBy({ left: -stepW(), behavior: 'smooth' });
  $('carPrev').onclick = () => car.scrollBy({ left: stepW(), behavior: 'smooth' });

  /* ---------- copy + form ---------- */
  const toast = $('toast');
  let toastT;
  const say = (msg) => {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => toast.classList.remove('show'), 2200);
  };
  document.querySelectorAll('[data-copy]').forEach((b) =>
    b.addEventListener('click', async () => {
      const v = b.dataset.copy === 'email' ? S.email : S.phone;
      try { await navigator.clipboard.writeText(v); say('הועתק ✓ ' + v); }
      catch { say(v); }
    })
  );
  $('transmit').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = `${f.get('message')}\n\n— ${f.get('name')}`;
    location.href = `mailto:${S.email}?subject=${encodeURIComponent(f.get('subject'))}&body=${encodeURIComponent(body)}`;
    say('🚀 פותח את תוכנת המייל…');
  });

  /* ---------- starfield ---------- */
  const cv = $('space');
  const ctx = cv.getContext('2d');
  let W, H, stars = [], shooters = [];
  let mx = 0, my = 0;
  const DPR = Math.min(devicePixelRatio || 1, 2);
  const resize = () => {
    W = cv.width = innerWidth * DPR;
    H = cv.height = innerHeight * DPR;
    const count = Math.min(420, Math.floor((innerWidth * innerHeight) / 4200));
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      z: Math.random() * 0.9 + 0.1, // depth: bigger = closer
      tw: Math.random() * Math.PI * 2,
      hue: Math.random() < 0.15 ? (Math.random() < 0.5 ? 200 : 280) : 0,
    }));
  };
  resize();
  addEventListener('resize', resize);
  addEventListener('pointermove', (e) => {
    mx = e.clientX / innerWidth - 0.5;
    my = e.clientY / innerHeight - 0.5;
  }, { passive: true });

  const draw = (t) => {
    ctx.clearRect(0, 0, W, H);
    for (const s of stars) {
      const px = (s.x - mx * 30 * s.z * DPR) % W;
      const py = (((s.y - scrollY * 0.25 * s.z * DPR - my * 30 * s.z * DPR) % H) + H) % H;
      const a = 0.35 + 0.65 * Math.abs(Math.sin(s.tw + t * 0.001 * (0.5 + s.z)));
      ctx.fillStyle = s.hue ? `hsla(${s.hue},90%,80%,${a})` : `rgba(255,255,255,${a * s.z + 0.1})`;
      ctx.beginPath();
      ctx.arc((px + W) % W, py, s.z * 1.4 * DPR, 0, Math.PI * 2);
      ctx.fill();
    }
    if (Math.random() < 0.006 && shooters.length < 2) {
      shooters.push({ x: Math.random() * W, y: Math.random() * H * 0.5, vx: -(6 + Math.random() * 6) * DPR, vy: (2 + Math.random() * 3) * DPR, life: 1 });
    }
    shooters = shooters.filter((s) => s.life > 0);
    for (const s of shooters) {
      const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 12, s.y - s.vy * 12);
      g.addColorStop(0, `rgba(255,255,255,${s.life})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.6 * DPR;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 12, s.y - s.vy * 12);
      ctx.stroke();
      s.x += s.vx; s.y += s.vy; s.life -= 0.015;
    }
    if (!reduced) requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);

  /* ---------- skills constellation ---------- */
  const cc = $('constellation');
  const cx = cc.getContext('2d');
  let CW, CH, nodes = [];
  const pointer = { x: -1e4, y: -1e4 };
  const initC = () => {
    const r = cc.getBoundingClientRect();
    CW = cc.width = r.width * DPR;
    CH = cc.height = r.height * DPR;
    const pad = 70 * DPR;
    nodes = S.skills.map((label) => ({
      label,
      x: pad + Math.random() * (CW - pad * 2),
      y: pad + Math.random() * (CH - pad * 2),
      vx: (Math.random() - 0.5) * 0.35 * DPR,
      vy: (Math.random() - 0.5) * 0.35 * DPR,
      glow: 0,
    }));
  };
  initC();
  addEventListener('resize', initC);
  const setPointer = (e) => {
    const r = cc.getBoundingClientRect();
    pointer.x = (e.clientX - r.left) * DPR;
    pointer.y = (e.clientY - r.top) * DPR;
  };
  cc.addEventListener('pointermove', setPointer);
  cc.addEventListener('pointerdown', setPointer);
  cc.addEventListener('pointerleave', () => { pointer.x = pointer.y = -1e4; });

  const LINK = 190 * DPR;
  const drawC = () => {
    cx.clearRect(0, 0, CW, CH);
    for (const n of nodes) {
      n.x += n.vx; n.y += n.vy;
      if (n.x < 40 * DPR || n.x > CW - 40 * DPR) n.vx *= -1;
      if (n.y < 30 * DPR || n.y > CH - 30 * DPR) n.vy *= -1;
      const d = Math.hypot(n.x - pointer.x, n.y - pointer.y);
      n.glow += ((d < 140 * DPR ? 1 : 0) - n.glow) * 0.08;
    }
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const boost = Math.max(a.glow, b.glow);
        if (d < LINK * (1 + boost * 0.8)) {
          cx.strokeStyle = `rgba(94,231,255,${(1 - d / (LINK * 1.8)) * (0.12 + boost * 0.6)})`;
          cx.lineWidth = DPR;
          cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.stroke();
        }
      }
      const n = nodes[i];
      const dp = Math.hypot(n.x - pointer.x, n.y - pointer.y);
      if (dp < 220 * DPR) {
        cx.strokeStyle = `rgba(167,139,250,${0.5 * (1 - dp / (220 * DPR))})`;
        cx.beginPath(); cx.moveTo(n.x, n.y); cx.lineTo(pointer.x, pointer.y); cx.stroke();
      }
    }
    cx.textAlign = 'center';
    for (const n of nodes) {
      const r = (3 + n.glow * 4) * DPR;
      cx.shadowColor = 'rgba(94,231,255,0.9)';
      cx.shadowBlur = (8 + n.glow * 20) * DPR;
      cx.fillStyle = '#fff';
      cx.beginPath(); cx.arc(n.x, n.y, r, 0, Math.PI * 2); cx.fill();
      cx.shadowBlur = 0;
      cx.font = `${600} ${(14 + n.glow * 4) * DPR}px -apple-system, Heebo, sans-serif`;
      cx.fillStyle = `rgba(245,245,247,${0.55 + n.glow * 0.45})`;
      cx.fillText(n.label, n.x, n.y - 14 * DPR);
    }
    requestAnimationFrame(drawC);
  };
  requestAnimationFrame(drawC);
})();
