// 用過去食譜建立紀錄裡「已確認」的食材對應來測試辨識。
// 用法：node tools/test.js
const path = require("path");
const M = require(path.join(__dirname, "..", "matcher.js"));
const data = require(path.join(__dirname, "..", "data", "ingredients.json"));
const aliases = require(path.join(__dirname, "..", "data", "aliases.json"));
const pinyin = require(path.join(__dirname, "..", "data", "pinyin.json"));
const m = M.createMatcher(data.items, { aliases, pinyin });

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log("  ✗ " + msg); } };

// ---- 拆句 ----
const parseCases = [
  ["蘿蔔糕130克、櫻桃蘿蔔30克、海鹽0.2克", [["蘿蔔糕", 130], ["櫻桃蘿蔔", 30], ["海鹽", 0.2]]],
  ["蘿蔔糕130克櫻桃蘿蔔30克葵花油8克", [["蘿蔔糕", 130], ["櫻桃蘿蔔", 30], ["葵花油", 8]]],
  ["洛神花三百五十克 水三百克 砂糖兩百一十克", [["洛神花", 350], ["水", 300], ["砂糖", 210]]],
  ["覆盆莓每30克", [["覆盆莓", 30]]],
  ["鹽和糖各5克", [["鹽", 5], ["糖", 5]]],
  ["九層塔20g，檸檬汁15g", [["九層塔", 20], ["檸檬汁", 15]]],
  ["白蘿蔔1公斤\n鹽20克", [["白蘿蔔", 1000], ["鹽", 20]]],
  ["然後再加黑胡椒零點一克", [["黑胡椒", 0.1]]],
  ["節瓜一百五克還有腰果40克", [["節瓜", 150], ["腰果", 40]]],
  ["三蔬料20克 四季檸檬醃漬白蘿蔔十克", [["三蔬料", 20], ["四季檸檬醃漬白蘿蔔", 10]]],
  ["紅心芭樂600、檸檬汁22.5", [["紅心芭樂", 600], ["檸檬汁", 22.5]]],
  ["青醬", [["青醬", null]]],
];
console.log("拆句測試");
for (const [text, want] of parseCases) {
  const got = M.parse(text).map((x) => [x.name, x.grams]);
  ok(JSON.stringify(got) === JSON.stringify(want), `${text} → ${JSON.stringify(got)}，應為 ${JSON.stringify(want)}`);
}

// ---- 對應：[說法, 正確 ID, 是否應該自動確定] ----
const matchCases = [
  // 主餐 蘿蔔和蘿蔔糕
  ["櫻桃蘿蔔", "ID645", false], ["葵花油", "ID138", true], ["海鹽", "ID126", true], ["黑胡椒", "ID255", true],
  ["植物奶油", "ID449", true], ["青醬", "PREP19", true], ["橄欖油", "ID139", true], ["牛蒡", "ID047", true],
  // 配料 PREP83/84/85
  ["洛神花", "ID394", true], ["水", "ID489", true], ["砂糖", "ID128", true], ["覆盆莓", "ID467", true],
  ["紅心芭樂", "ID572", true], ["檸檬汁", "ID456", true], ["洛神粉", "ID204", true],
  ["白蘿蔔", "ID046", false], ["鹽", "ID126", true], ["糖", "ID128", true], ["蘋果醋", "ID119", true], ["檸檬皮", "ID348", true],
  // 里仁餐會
  ["蘿蔔葉", "ID068", true], ["菠菜", "ID069", false], ["節瓜", "ID054", true], ["腰果", "ID427", true], ["玉米筍", "ID111", true],
  ["山藥", "ID017", true], ["南瓜", "ID005", true], ["白花椰菜", "ID019", false], ["杏鮑菇", "ID286", true], ["香菇", "ID289", false],
  ["四季檸檬醃漬蘿蔔", "PREP85", false], ["糙米醬油", "ID144", true], ["陳年糙米醬油", "ID142", true], ["糙米醋", "ID118", true],
  ["蒜頭", "ID055", true], ["紫洋蔥", "ID059", false], ["酪梨", "ID341", false], ["白芝麻", "ID153", true], ["白飯", "PREP7", true],
  ["芥藍花", "ID706", true], ["青花苗", "ID322", false], ["糯米粉", "ID411", true], ["樹薯粉", "ID413", true], ["柳橙汁", "ID146", true],
  ["調和醬油", "PREP23", true], ["薩塔粉", "PREP31", true], ["白精靈菇", "ID298", true], ["紫蘇", "ID370", true], ["甜椒", "ID071", true],
  // 語音打錯字（同音）
  ["素薯粉", "ID413", true],
  // 同名不同廠商：應列候選讓使用者選
  ["九層塔", "ID115", false], ["薑", "ID043", false], ["紅蘿蔔", "ID021", false],
  // 以下品項在食材總表有同名的兩筆（不同廠商/規格），應列候選讓使用者選
];
console.log("對應測試");
let top1 = 0, inCands = 0;
for (const [say, id, shouldAuto] of matchCases) {
  const r = m.match(say);
  const c = r.candidates;
  const isTop = c[0] && c[0].item.id === id;
  const inList = c.some((x) => x.item.id === id);
  if (isTop) top1++;
  if (inList) inCands++;
  const brief = c.slice(0, 3).map((x) => `${x.item.id}${x.item.name}(${x.score},${x.how})`).join(" | ");
  if (shouldAuto) ok(isTop && r.status === "ok", `${say} 應自動對到 ${id}；結果 ${r.status}：${brief}`);
  else ok(inList && r.status !== "none", `${say} 應在候選中列出 ${id}；結果 ${r.status}：${brief}`);
}
// 記住上次的選擇後，同名品項就自動選好
const mem = { [M.norm("薑")]: "ID043" };
const rm = m.match("薑", mem);
ok(rm.status === "ok" && rm.candidates[0].item.id === "ID043", "記住選擇後「薑」應自動對到 ID043");
// 蘿蔔糕在食材總表沒有 ID，但仍要找得到
const rg = m.match("蘿蔔糕");
ok(rg.candidates[0] && rg.candidates[0].item.name === "蘿蔔糕", "蘿蔔糕（無 ID）應找得到");

console.log(`\n第一順位正確 ${top1}/${matchCases.length}，候選中有正確答案 ${inCands}/${matchCases.length}`);
console.log(`通過 ${pass}，失敗 ${fail}`);
process.exit(fail ? 1 : 0);
