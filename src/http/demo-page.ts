export const demoPage = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Legara — demo</title>
<style>
  :root {
    --paper: #f3efe6;
    --ink: #1c1915;
    --soft: #6b645b;
    --line: #ddd4c6;
    --card: #fffcf7;
    --accent: #8f3d32;
    --live: #2f6f4e;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body {
    font-family: "Segoe UI", Helvetica, Arial, sans-serif;
    background: var(--paper);
    color: var(--ink);
    min-height: 100%;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 28px;
    border-bottom: 1px solid var(--line);
  }
  .brand { font-family: Georgia, "Times New Roman", serif; font-size: 28px; letter-spacing: -0.03em; }
  .brand span { color: var(--soft); font-family: "Segoe UI", Helvetica, sans-serif; font-size: 14px; margin-left: 12px; letter-spacing: 0; }
  button {
    font: inherit;
    border: 1px solid var(--ink);
    background: var(--ink);
    color: var(--paper);
    padding: 10px 16px;
    cursor: pointer;
  }
  button.ghost { background: transparent; color: var(--ink); }
  button:disabled { opacity: 0.4; cursor: default; }
  main {
    display: grid;
    grid-template-columns: 280px 1fr 360px;
    gap: 0;
    min-height: calc(100vh - 73px);
  }
  section { padding: 22px; border-right: 1px solid var(--line); }
  section:last-child { border-right: 0; }
  h2 { margin: 0 0 14px; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--soft); font-weight: 600; }
  .stage {
    display: flex; gap: 10px; align-items: baseline;
    padding: 8px 0;
    color: var(--soft);
  }
  .stage.on { color: var(--ink); }
  .stage .n { font-variant-numeric: tabular-nums; width: 18px; }
  .log { margin-top: 18px; font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; font-size: 12px; line-height: 1.45; }
  .log p { margin: 0 0 12px; }
  .log .day { color: var(--accent); }
  .hero { max-width: 640px; }
  .kicker { color: var(--accent); font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; margin: 0 0 8px; }
  .hero h1 { font-family: Georgia, serif; font-weight: 500; font-size: 40px; line-height: 1.05; letter-spacing: -0.03em; margin: 0 0 12px; }
  .muted { color: var(--soft); }
  .pills { display: flex; gap: 8px; flex-wrap: wrap; margin: 16px 0; }
  .pill { border: 1px solid var(--line); background: var(--card); padding: 6px 10px; font-size: 13px; }
  .hidden { display: none; }
  .cascade { margin-top: 28px; }
  .cascade li { padding: 8px 0; border-top: 1px solid var(--line); list-style: none; display: flex; justify-content: space-between; gap: 12px; }
  ul { margin: 0; padding: 0; }
  .note {
    background: var(--card);
    border: 1px solid var(--line);
    padding: 16px;
    white-space: pre-wrap;
    line-height: 1.45;
    min-height: 180px;
  }
  .who { margin: 0 0 8px; }
  .sent { color: var(--live); font-weight: 600; }
  @media (max-width: 980px) {
    main { grid-template-columns: 1fr; }
    section { border-right: 0; border-bottom: 1px solid var(--line); }
  }
</style>
</head>
<body>
<header>
  <div class="brand">Legara <span>A supermarket fails. Watch who needs a lawyer.</span></div>
  <div>
    <button id="play" class="ghost" type="button">Play it again</button>
  </div>
</header>
<main>
  <section>
    <h2>The swarm</h2>
    <div id="stages"></div>
    <div class="log" id="log"></div>
  </section>
  <section>
    <div class="hero">
      <p class="kicker" id="kicker">Watching the public record</p>
      <h1 id="headline">Nothing yet. The week is about to start.</h1>
      <p class="muted" id="detail">Three records. Then a name, a partner, and a note.</p>
      <div class="pills hidden" id="pills"></div>
      <div class="cascade hidden" id="cascade-wrap">
        <h2>The same event hits other companies</h2>
        <ul id="cascade"></ul>
      </div>
    </div>
  </section>
  <section>
    <h2>The note</h2>
    <p class="who muted" id="who">It will be written in the partner’s voice, once someone at Legara knows them.</p>
    <div class="note" id="note"></div>
    <p style="margin-top:14px">
      <button id="send" type="button" disabled>Send from James’s mailbox</button>
    </p>
    <p id="sent" class="sent hidden">Sent. It is in the test outbox, from James Ellison, not from a shared address.</p>
  </section>
</main>
<script>
const stages = [
  ["01", "Detect", "Read the record"],
  ["02", "Map", "Who else it touches"],
  ["03", "Predict", "What they will need, and when"],
  ["04", "Connect", "Who at Legara knows them"],
  ["05", "Engage", "Write the note"],
];
const stageEl = document.getElementById("stages");
stageEl.innerHTML = stages.map(([n, name, sub], i) =>
  '<div class="stage" data-i="'+i+'"><span class="n">'+n+'</span><div><strong>'+name+'</strong><div class="muted">'+sub+'</div></div></div>'
).join("");

let story = null;
let timer = null;

function setStage(upTo) {
  document.querySelectorAll(".stage").forEach((el, i) => el.classList.toggle("on", i <= upTo));
}
function log(day, text) {
  const p = document.createElement("p");
  p.innerHTML = '<span class="day">'+day+'</span><br>'+text;
  document.getElementById("log").prepend(p);
}

function reset() {
  clearTimeout(timer);
  document.getElementById("log").innerHTML = "";
  setStage(-1);
  document.getElementById("kicker").textContent = "Watching the public record";
  document.getElementById("headline").textContent = "Nothing yet. The week is about to start.";
  document.getElementById("detail").textContent = "Three records. Then a name, a partner, and a note.";
  document.getElementById("pills").classList.add("hidden");
  document.getElementById("cascade-wrap").classList.add("hidden");
  document.getElementById("who").textContent = "It will be written in the partner’s voice, once someone at Legara knows them.";
  document.getElementById("who").classList.add("muted");
  document.getElementById("note").textContent = "";
  document.getElementById("send").disabled = true;
  document.getElementById("sent").classList.add("hidden");
}

function play() {
  if (!story) return;
  reset();
  const steps = [];
  story.feed.forEach((item, index) => {
    steps.push(() => {
      setStage(index === 2 ? 1 : 0);
      log(item.day, item.title);
      if (index === 0) {
        document.getElementById("kicker").textContent = item.day;
        document.getElementById("headline").textContent = "Meridian, a supermarket, goes into administration.";
        document.getElementById("detail").textContent = "Its suppliers, landlords, lender and staff are now in play. Legara does not have to go looking.";
      }
    });
  });
  steps.push(() => {
    setStage(2);
    document.getElementById("kicker").textContent = "Prediction";
    document.getElementById("headline").textContent = story.company.replace(" Ltd", "") + " will need a lawyer in the next " + story.window + ".";
    document.getElementById("detail").textContent = story.companyDetail + " The claim, the unpaid stock, money that might be clawed back, and the new bank security.";
    const pills = document.getElementById("pills");
    pills.classList.remove("hidden");
    pills.innerHTML = story.practices.map((p) => '<span class="pill">'+p.name+' · '+p.likelihood+'%</span>').join("");
  });
  steps.push(() => {
    setStage(3);
    document.getElementById("kicker").textContent = "Warmest way in";
    document.getElementById("detail").textContent = story.approach.partnerName + " has emailed " + story.contact + ", their managing director, " + story.exchanges + " times in the last year. He sends it. Not a stranger.";
  });
  steps.push(() => {
    setStage(4);
    document.getElementById("who").classList.remove("muted");
    document.getElementById("who").textContent = "To " + story.contact + " · from " + story.approach.partnerName;
    document.getElementById("note").textContent = story.approach.body;
    document.getElementById("send").disabled = story.approach.status === "sent";
    if (story.approach.status === "sent") document.getElementById("sent").classList.remove("hidden");
    const list = document.getElementById("cascade");
    const creditors = story.cascade.filter((c) => c.role === "creditor");
    const rest = story.cascade.filter((c) => c.role !== "creditor");
    const rows = [];
    if (creditors.length) rows.push('<li><span>'+creditors.length+' other named creditors</span><span class="muted">Insolvency</span></li>');
    rest.forEach((c) => rows.push('<li><span>'+c.company.replace(" Ltd","").replace(" plc","")+' — '+c.why+'</span><span class="muted">'+c.practice+'</span></li>'));
    list.innerHTML = rows.join("");
    document.getElementById("cascade-wrap").classList.remove("hidden");
    document.querySelector("#cascade-wrap h2").textContent = "The same administration also opens " + story.cascadeCount + " other matters";
  });

  let i = 0;
  const tick = () => {
    if (i >= steps.length) return;
    steps[i]();
    i += 1;
    timer = setTimeout(tick, 1100);
  };
  tick();
}

document.getElementById("play").onclick = play;
document.getElementById("send").onclick = async () => {
  const button = document.getElementById("send");
  button.disabled = true;
  const res = await fetch("/demo/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ approachId: story.approach.approachId }),
  });
  if (res.ok) {
    story.approach.status = "sent";
    document.getElementById("sent").classList.remove("hidden");
  } else {
    button.disabled = false;
    document.getElementById("sent").textContent = "Could not send. The draft may already be blocked.";
    document.getElementById("sent").classList.remove("hidden");
  }
};

fetch("/demo/story").then((r) => r.json()).then((data) => {
  story = data;
  if (!data || !data.approach) {
    document.getElementById("headline").textContent = "The Legara example is not loaded.";
    return;
  }
  play();
});
</script>
</body>
</html>
`;
