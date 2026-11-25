const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 520, height: 760 }, deviceScaleFactor: 2 });
  await p.goto('file://' + __dirname + '/card.svg');
  await p.screenshot({ path: __dirname + '/card.png' });
  if (process.argv[2]) { // zoom crop of art panel
    await p.setViewportSize({width:520,height:760});
    await p.screenshot({ path: __dirname + '/crop.png', clip:{x:20,y:70,width:480,height:440} });
  }
  await b.close();
})();
