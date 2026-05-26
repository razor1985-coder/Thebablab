import { useState, useEffect, useRef } from "react";

// ─── SEED RULES ───────────────────────────────────────────────────────────
const SEED_RULES = [
  { id:"R1",  label:"Combined xG < 1.5",               markets:["Over 2.5 Goals","BTTS","Both Teams & Over 2.5"],                          verdict:"HARD AVOID",  penalty:-50, detail:"Every BAB with combined xG under 1.5 failed on goals/BTTS markets. No exceptions." },
  { id:"R2",  label:"Away xG < 1.0 → No BTTS",         markets:["BTTS","Both Teams & Over 2.5"],                                           verdict:"HARD AVOID",  penalty:-45, detail:"Away team not creating = won't score. All tracked BTTS losses had away xG under 1.0." },
  { id:"R3",  label:"Serie A dead rubber",              markets:["Over 2.5 Goals","BTTS","Both Teams & Over 2.5"],                          verdict:"HARD AVOID",  penalty:-50, detail:"Serie A dead rubbers produced 0-0s across entire tracked dataset." },
  { id:"R4",  label:"Play-off/Cup final at Wembley",    markets:["Over 8.5 Corners","Over 9.5 Corners","Over 10.5 Corners","Over 2.5 Goals"], verdict:"HARD AVOID",  penalty:-50, detail:"Hull vs Boro 23 May 2026: only 4 corners total. Tension kills open play. Never back corners or goals in one-off finals." },
  { id:"R5",  label:"Home team sitting deep",           markets:["Over 8.5 Corners","Over 9.5 Corners","Over 10.5 Corners","Over 2.5 Goals"], verdict:"HARD AVOID",  penalty:-40, detail:"Leeds 1-0 Brighton: corners dried up when Leeds sat deep. Bin corners/goals when home team parks." },
  { id:"R6",  label:"Relegation battle",               markets:["BTTS","Over 2.5 Goals"],                                                  verdict:"STRONG BACK", bonus:25,  detail:"Both teams must attack. Strong BTTS and Over 2.5 signal. Final day relegation = maximum motivation." },
  { id:"R7",  label:"Derby / rivalry",                 markets:["BTTS","Over 2.5 Goals","Player Cards"],                                   verdict:"STRONG BACK", bonus:25,  detail:"Rivalry games outperform xG models. Man Utd vs Liverpool: 5 goals from xG 1.03." },
  { id:"R8",  label:"High shots + low xG",             markets:["Over 2.5 Goals","BTTS"],                                                  verdict:"AVOID",       penalty:-25, detail:"Lots of shots but low xG = pot shots. Don't confuse shot volume with goal threat." },
  { id:"R9",  label:"SOT each half — fragile",         markets:["Player SOT Each Half"],                                                   verdict:"AVOID",       penalty:-30, detail:"Leeds vs Brighton: SOT each half legs failed in 1-0. Too fragile in low-tempo matches." },
  { id:"R10", label:"Fouls markets — safe",            markets:["Player Fouls","Total Match Fouls"],                                        verdict:"STRONG BACK", bonus:15,  detail:"Fouls happen regardless of scoreline. Safer leg in defensive games." },
  { id:"R11", label:"Away nothing to play for",        markets:["BTTS","Over 2.5 Goals","Away Team To Score"],                             verdict:"AVOID",       penalty:-30, detail:"Away teams with no motivation go flat. xG craters. Avoid all goals markets." },
  { id:"R12", label:"Combined xG > 2.5",              markets:["Over 2.5 Goals","BTTS"],                                                  verdict:"STRONG BACK", bonus:15,  detail:"When both teams averaging high xG, goals markets are well supported." },
  { id:"R13", label:"Player not in confirmed XI",      markets:["Player SOT","Player SOT Each Half","Anytime Scorer","Player Cards","Player Fouls"], verdict:"HARD AVOID", penalty:-60, detail:"If the player in a prop leg is not in the confirmed starting XI, drop that leg immediately." },
  { id:"R14", label:"High-carding referee (4+/game)", markets:["Player Cards","Total Match Fouls"],                                        verdict:"STRONG BACK", bonus:20,  detail:"Referee averaging 4+ cards/game significantly boosts cards leg viability." },
  { id:"R15", label:"Lenient referee (<2.5/game)",    markets:["Player Cards"],                                                            verdict:"AVOID",       penalty:-25, detail:"Referee averaging under 2.5 cards/game weakens any cards leg." },
  { id:"R16", label:"Final day — nothing to play for (mid-table)", markets:["Over 2.5 Goals","BTTS"],                                     verdict:"AVOID",       penalty:-20, detail:"Mid-table teams on final day with no European place or relegation threat often produce flat, low-intensity games." },
  { id:"R17", label:"Title already won — top team may rotate", markets:["Team To Win","Anytime Scorer"],                                  verdict:"AVOID",       penalty:-15, detail:"When a title is already secured, teams rotate. Don't back the champions to win big on final day." },
  { id:"R18", label:"5+ leg BAB — probability collapses", markets:["All"],                                                                  verdict:"AVOID",       penalty:0,   detail:"Every leg added roughly halves the win probability. 4 legs at 70% each = ~24% hit rate. 6 legs = ~12%. Stick to 4, max 5 strong legs only." },
  { id:"R19", label:"Super Sub scorer — cold sub unlikely to score", markets:["Anytime Scorer","Player To Score 2+"],                        verdict:"AVOID",       penalty:-25, detail:"24 May 2026: Evanilson → Unal came on but didn't score. Sub strikers rarely score — they're cold and the game may be tight. Avoid scorer markets relying on a substitute." },
  { id:"R20", label:"Super Sub shots — sub rarely gets 2+ shots", markets:["Player 2+ Shots","Player 2+ Shots on Target"],                   verdict:"AVOID",       penalty:-30, detail:"24 May 2026: Mbeumo → Zirkzee only managed 1 shot replacing Mbeumo. A sub striker in a tight game rarely gets 2+ shots. Downgrade any shots threshold market involving a Super Sub." },
  { id:"R21", label:"Away team rotates 5+ players — home fouls committed drops", markets:["Player 1+ Fouls Committed"],                      verdict:"CAUTION",     penalty:-20, detail:"24 May 2026: Lerma 0 fouls vs Arsenal who rotated 6 players. When away team is weakened, home midfielder has less to fight against — fouls committed drops sharply. Avoid high fouls committed markets when opposition is heavily rotated." },
  { id:"R22", label:"BTTS on final day — lower hit rate than season", markets:["BTTS","Both Teams & Over 2.5"],                              verdict:"CAUTION",     penalty:-10, detail:"24 May 2026: BTTS went 4W/4L on final day. Teams with nothing to play for don't push to score — Spurs, Brighton, Leeds all failed to score. Apply extra scrutiny to BTTS on final day." },
  { id:"R23", label:"Relegation decider home team — expect high Over 2.5", markets:["Over 2.5 Goals","BTTS"],                               verdict:"BACK",        penalty:15,  detail:"24 May 2026: West Ham 3-0 Leeds. Relegation decider home teams attack frantically from minute 1 — Over 2.5 strongly backed in must-win home relegation games." },
  { id:"R24", label:"European motivated away team (both chasing) — open game", markets:["Over 2.5 Goals","BTTS","Player Shots"],             verdict:"BACK",        penalty:15,  detail:"24 May 2026: Sunderland vs Chelsea (both chasing Europe) — perfect BAB, all 4 legs landed. When both sides need a win for European qualification, the game opens up massively." },
  { id:"R25", label:"Fouls won — starting winger in high-stakes game", markets:["Player 1+ Fouls Won"],                                      verdict:"BACK",        penalty:15,  detail:"24 May 2026: Bailey ✅, Gibbs-White ✅, Ampadu ✅. Fouls won by starting wingers/attacking mids in high-stakes games is highly reliable. Avoid if player is a substitute." },
];

// Full Sky Bet BAB market list
const MARKETS = [
  // Goals
  "BTTS","Over 2.5 Goals","Under 2.5 Goals","Both Teams & Over 2.5","Away Team To Score","Anytime Scorer","First Goalscorer","Player To Score 2+",
  // First half
  "Over 0.5 First Half Goals","Over 1.5 First Half Goals","BTTS First Half","Half Time Draw","Half Time Home Win","Half Time Away Win",
  // Corners
  "Over 8.5 Corners","Over 9.5 Corners","Over 10.5 Corners","Over 11.5 Corners","Under 8.5 Corners","Home Team Over 4.5 Corners","Away Team Over 4.5 Corners",
  // Cards
  "Player Cards","Over 3.5 Cards","Over 4.5 Cards","Over 5.5 Cards","Home Team Over 1.5 Cards","Away Team Over 1.5 Cards",
  // Player shots
  "Player 1+ Shots","Player 2+ Shots","Player 3+ Shots","Player 1+ Shots on Target","Player 2+ Shots on Target",
  // Player fouls
  "Player 1+ Fouls Committed","Player 2+ Fouls Committed","Player 3+ Fouls Committed","Player 1+ Fouls Won","Player 2+ Fouls Won",
  // Player other
  "Player 1+ Assists","Player 1+ Key Passes","Team To Win","Clean Sheet Home","Clean Sheet Away",
  // Total match
  "Total Match Fouls Over 20.5","Total Match Fouls Over 22.5","Total Match Fouls Over 24.5","Total Shots Over 22.5","Total Shots Over 24.5",
  // Legacy
  "Player SOT Each Half","Player Fouls","Total Match Fouls","Player SOT"
];

// Market categories for UI grouping
const MARKET_GROUPS = {
  "Goals": ["BTTS","Over 2.5 Goals","Under 2.5 Goals","Both Teams & Over 2.5","Away Team To Score","Anytime Scorer","First Goalscorer","Player To Score 2+"],
  "First Half": ["Over 0.5 First Half Goals","Over 1.5 First Half Goals","BTTS First Half","Half Time Draw","Half Time Home Win","Half Time Away Win"],
  "Corners": ["Over 8.5 Corners","Over 9.5 Corners","Over 10.5 Corners","Over 11.5 Corners","Under 8.5 Corners","Home Team Over 4.5 Corners","Away Team Over 4.5 Corners"],
  "Cards": ["Player Cards","Over 3.5 Cards","Over 4.5 Cards","Over 5.5 Cards","Home Team Over 1.5 Cards","Away Team Over 1.5 Cards"],
  "Player Shots": ["Player 1+ Shots","Player 2+ Shots","Player 3+ Shots","Player 1+ Shots on Target","Player 2+ Shots on Target"],
  "Player Fouls": ["Player 1+ Fouls Committed","Player 2+ Fouls Committed","Player 3+ Fouls Committed","Player 1+ Fouls Won","Player 2+ Fouls Won"],
  "Player Other": ["Player 1+ Assists","Player 1+ Key Passes","Team To Win","Clean Sheet Home","Clean Sheet Away"],
  "Match Totals": ["Total Match Fouls Over 20.5","Total Match Fouls Over 22.5","Total Match Fouls Over 24.5","Total Shots Over 22.5","Total Shots Over 24.5"]
};
const CONTEXTS = ["Standard League Match","Relegation Battle","Title Race","Promotion Chase","European Chase","Derby / Rivalry","Nothing to Play For","Final Day","Final Day — Relegation Decider","Final Day — European Chase","Play-Off Final / Wembley Final","Cup Final / One-Off Game","Dead Rubber"];

// ─── PREMIER LEAGUE FINAL DAY FIXTURES ───────────────────────────────────
const PL_FINAL_DAY = [
  { home:"Brighton", away:"Manchester United", context:"Final Day", note:"Man Utd top half safe. Brighton European chase." },
  { home:"Burnley", away:"Wolves", context:"Final Day", note:"Both mid-table. Low motivation risk." },
  { home:"Crystal Palace", away:"Arsenal", context:"Final Day — European Chase", note:"Arsenal champions — may rotate. Palace nothing to play for." },
  { home:"Fulham", away:"Newcastle", context:"Final Day — European Chase", note:"Newcastle European chase. High stakes away." },
  { home:"Liverpool", away:"Brentford", context:"Final Day", note:"Liverpool top. Brentford safe." },
  { home:"Manchester City", away:"Aston Villa", context:"Final Day — European Chase", note:"Both chasing European spots. High motivation both sides." },
  { home:"Nottingham Forest", away:"Bournemouth", context:"Final Day — European Chase", note:"Forest European chase. Massive motivation." },
  { home:"Sunderland", away:"Chelsea", context:"Final Day", note:"Sunderland safe. Chelsea European confirmed." },
  { home:"Tottenham", away:"Everton", context:"Final Day — Relegation Decider", note:"MASSIVE — Spurs may go down. Relegation decider. Expect cards, fouls, high intensity." },
  { home:"West Ham", away:"Leeds United", context:"Final Day — Relegation Decider", note:"MASSIVE — West Ham may go down. Leeds safe. Relegation decider." },
];

// ─── COLOURS ──────────────────────────────────────────────────────────────
const C = { bg:"#07070a", card:"#0e0e12", border:"#1c1c24", green:"#00ff87", amber:"#ffb800", red:"#ff3b3b", blue:"#00c6ff", purple:"#a855f7", text:"#e2ddd0", muted:"#4a4a5a", dim:"#252530" };
const vc = v => v==="BACK IT"||v==="STRONG BACK" ? C.green : v==="THINK TWICE" ? C.amber : C.red;
const pill = (label, color) => ({ display:"inline-block", padding:"2px 10px", fontSize:9, letterSpacing:2, fontWeight:700, textTransform:"uppercase", fontFamily:"monospace", background:color+"18", color, border:`1px solid ${color}30` });

// ─── STORAGE ──────────────────────────────────────────────────────────────
const KEYS = { babs:"bablabs-v5-babs", stats:"bablabs-v5-stats", patterns:"bablabs-v5-patterns" };
const initStats = () => ({ marketHits:{}, contextHits:{}, leagueHits:{}, refereeHits:{}, playerHits:{}, totalBabs:0, wonBabs:0, totalLegs:0, wonLegs:0, totalStake:0, totalReturn:0 });

async function store(key, val) { try { await window.storage.set(key, JSON.stringify(val)); } catch {} }
async function retrieve(key, def) { try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : def; } catch { return def; } }

// ─── RULES ENGINE ─────────────────────────────────────────────────────────
function runRules(leg, match, rd, stats, confirmed, patterns) {
  let score = 60;
  const flags = [];
  const hXg = parseFloat(rd?.homeXg)||0, aXg = parseFloat(rd?.awayXg)||0, cXg = hXg+aXg;
  const aShots = parseFloat(rd?.awayShots)||0;
  const isPlayOff = match.context?.includes("Play-Off")||match.context?.includes("Cup Final");
  const isDerby = match.context?.includes("Derby");
  const isRelegation = match.context?.includes("Relegation");
  const isFinalDay = match.context?.includes("Final Day");
  const isNTP = match.context?.includes("Nothing to Play For")||match.context?.includes("Dead Rubber");
  const isSerieA = match.league==="Serie A";
  const mkt = leg.market;
  const refCards = parseFloat(rd?.refereeCardsAvg)||0;

  // Core rules
  if(cXg>0&&cXg<1.5&&(mkt.includes("BTTS")||mkt.includes("Over 2.5")||mkt.includes("Both Teams"))){score-=50;flags.push({type:"danger",rule:"R1",msg:`Combined xG ${cXg.toFixed(2)} — below 1.5. Hard avoid goals/BTTS.`});}
  if(aXg>0&&aXg<1.0&&(mkt==="BTTS"||mkt==="Both Teams & Over 2.5")){score-=45;flags.push({type:"danger",rule:"R2",msg:`Away xG ${aXg.toFixed(2)} — below 1.0. BTTS hard avoid.`});}
  if(isSerieA&&isNTP&&(mkt.includes("BTTS")||mkt.includes("Over 2.5"))){score-=50;flags.push({type:"danger",rule:"R3",msg:"Serie A dead rubber — hard avoid goals markets."});}
  if(isPlayOff&&(mkt.includes("Corner")||mkt.includes("Over 2.5"))){score-=50;flags.push({type:"danger",rule:"R4",msg:"Play-off/cup final — 4 corners at Wembley (Hull vs Boro). Never corners or goals in one-off finals."});}
  if((mkt.includes("Corner")||mkt==="Over 2.5 Goals")&&cXg>0&&cXg<1.8&&!isDerby&&!isRelegation){score-=40;flags.push({type:"danger",rule:"R5",msg:"Low xG + likely defensive tempo = corners/goals at risk."});}
  if(isRelegation&&(mkt==="BTTS"||mkt.includes("Over 2.5"))){score+=25;flags.push({type:"success",rule:"R6",msg:"Relegation battle — maximum motivation both sides. Final day = even stronger signal."});}
  if(isDerby){score+=25;flags.push({type:"success",rule:"R7",msg:"Derby/rivalry — emotion overrides xG."});}
  if(aShots>5&&aXg>0&&aXg<0.8&&(mkt.includes("BTTS")||mkt.includes("Over 2.5"))){score-=25;flags.push({type:"warning",rule:"R8",msg:`${aShots} away shots but xG ${aXg.toFixed(2)} — poor quality.`});}
  if(mkt.includes("Each Half")){score-=30;flags.push({type:"warning",rule:"R9",msg:"SOT each half fragile in tight games."});}
  if(mkt.includes("Foul")){score+=15;flags.push({type:"success",rule:"R10",msg:"Fouls markets unaffected by scoreline."});}
  if(isNTP&&(mkt==="BTTS"||mkt.includes("Over 2.5")||mkt==="Away Team To Score")){score-=30;flags.push({type:"danger",rule:"R11",msg:"Away nothing to play for — motivation gone."});}
  if(cXg>=2.5&&(mkt==="BTTS"||mkt.includes("Over 2.5"))){score+=15;flags.push({type:"success",rule:"R12",msg:`Combined xG ${cXg.toFixed(2)} — well backed.`});}
  // R13 — Confirmed lineup
  // R13 — fires on ANY player-specific market when lineups are confirmed
  const isPlayerMarket = leg.playerName && (
    mkt.includes("SOT") || mkt.includes("Shots") || mkt.includes("Fouls") ||
    mkt.includes("Scorer") || mkt.includes("Cards") || mkt.includes("Assists") ||
    mkt.includes("Goals") || mkt.includes("Key Passes")
  );
  if(confirmed?.lineupConfirmed && isPlayerMarket) {
    const all = [...(confirmed.homeXI||[]),...(confirmed.awayXI||[])].map(p=>p.toLowerCase());
    const pn = leg.playerName.toLowerCase();
    const lastName = pn.split(" ").pop();
    const starting = all.some(p => {
      const pLast = p.split(" ").pop();
      return p.includes(lastName) || pLast === lastName || pn.includes(pLast);
    });
    if(!starting && all.length>0) {
      score -= 60;
      flags.push({type:"danger", rule:"R13", msg:`⚠️ ${leg.playerName} NOT in confirmed starting XI — on bench or absent. Drop this leg immediately.`});
    } else if(starting) {
      score += 10;
      flags.push({type:"success", rule:"R13", msg:`✅ ${leg.playerName} confirmed in starting XI.`});
    }
  }
  // R14/R15 — Referee
  if(mkt==="Player Cards"||mkt==="Total Match Fouls"){
    if(refCards>=4){score+=20;flags.push({type:"success",rule:"R14",msg:`Ref averaging ${refCards} cards/game — high carding. Cards legs backed.`});}
    else if(refCards>0&&refCards<2.5){score-=25;flags.push({type:"danger",rule:"R15",msg:`Ref averaging only ${refCards} cards/game — lenient. Cards legs weakened.`});}
  }
  // R16 — Final day mid-table
  if(isFinalDay&&!isRelegation&&!match.context?.includes("European")&&(mkt==="BTTS"||mkt.includes("Over 2.5"))){
    score-=20;flags.push({type:"warning",rule:"R16",msg:"Final day with nothing at stake — mid-table teams often produce flat games."});
  }
  // R17 — Title rotation
  if(match.context?.includes("Title")&&mkt==="Team To Win"){score-=15;flags.push({type:"warning",rule:"R17",msg:"Title already won — rotation risk. Don't back champions to win on final day."});}

  // ── SHOTS MARKETS ───────────────────────────────────────────────────
  if(mkt.includes("Shots on Target")||mkt.includes("1+ Shots")||mkt.includes("2+ Shots")||mkt.includes("3+ Shots")) {
    const player = leg.playerName?.toLowerCase()||"";
    const playerData = [...(rd?.homePlayers||[]),(rd?.awayPlayers||[])].find(p=>p.name?.toLowerCase().includes(player.split(" ").pop()||"X"));
    if(playerData) {
      const threshold = mkt.includes("3+") ? 3 : mkt.includes("2+") ? 2 : 1;
      const onTarget = mkt.includes("on Target");
      const avg = onTarget ? (playerData.sotPerGame||0) : (playerData.shotsPerGame||0);
      if(avg >= threshold * 1.3){ score+=20; flags.push({type:"success",rule:"SHOTS",msg:`${playerData.name} avg ${avg.toFixed(1)} ${onTarget?"SOT":"shots"}/game — well above ${threshold}+ threshold.`});}
      else if(avg >= threshold){ score+=8; flags.push({type:"success",rule:"SHOTS",msg:`${playerData.name} avg ${avg.toFixed(1)} ${onTarget?"SOT":"shots"}/game — above threshold.`});}
      else if(avg < threshold * 0.7){ score-=20; flags.push({type:"warning",rule:"SHOTS",msg:`${playerData.name} avg only ${avg.toFixed(1)} ${onTarget?"SOT":"shots"}/game — below ${threshold}+ threshold.`});}
    }
    // Team context boosts for shots markets
    if(isRelegation||isDerby){ score+=10; flags.push({type:"success",rule:"SHOTS",msg:"High-intensity game boosts shot volumes — both teams pushed to attack."});}
    if(isFinalDay&&!isRelegation&&!match.context?.includes("European")){ score-=10; flags.push({type:"warning",rule:"SHOTS",msg:"Mid-table final day — reduced intensity may lower shot counts."});}
  }

  // ── FOULS COMMITTED MARKETS ──────────────────────────────────────────
  if(mkt.includes("Fouls Committed")) {
    const player = leg.playerName?.toLowerCase()||"";
    const threshold = mkt.includes("3+") ? 3 : mkt.includes("2+") ? 2 : 1;
    const playerData = [...(rd?.homePlayers||[]),(rd?.awayPlayers||[])].find(p=>p.name?.toLowerCase().includes(player.split(" ").pop()||"X"));
    if(playerData?.foulsCommittedPerGame) {
      const avg = playerData.foulsCommittedPerGame;
      if(avg >= threshold * 1.4){ score+=22; flags.push({type:"success",rule:"FOULS-C",msg:`${playerData.name} commits ${avg.toFixed(1)} fouls/game — strong above ${threshold}+ threshold.`});}
      else if(avg >= threshold){ score+=10; flags.push({type:"success",rule:"FOULS-C",msg:`${playerData.name} commits ${avg.toFixed(1)} fouls/game — above threshold.`});}
      else{ score-=20; flags.push({type:"warning",rule:"FOULS-C",msg:`${playerData.name} only ${avg.toFixed(1)} fouls/game — risky for ${threshold}+ market.`});}
    }
    if(refCards>=4){ score+=12; flags.push({type:"success",rule:"FOULS-C",msg:`High-carding ref (${refCards}/game) — more fouls likely to be punished.`});}
    if(isRelegation||isDerby){ score+=15; flags.push({type:"success",rule:"FOULS-C",msg:"High-stakes game — tackles and fouls will be flying."});}
  }

  // ── FOULS WON MARKETS ────────────────────────────────────────────────
  if(mkt.includes("Fouls Won")) {
    const player = leg.playerName?.toLowerCase()||"";
    const threshold = mkt.includes("2+") ? 2 : 1;
    const playerData = [...(rd?.homePlayers||[]),(rd?.awayPlayers||[])].find(p=>p.name?.toLowerCase().includes(player.split(" ").pop()||"X"));
    if(playerData?.foulsWonPerGame) {
      const avg = playerData.foulsWonPerGame;
      if(avg >= threshold * 1.4){ score+=22; flags.push({type:"success",rule:"FOULS-W",msg:`${playerData.name} wins ${avg.toFixed(1)} fouls/game — excellent for ${threshold}+ market.`});}
      else if(avg >= threshold){ score+=10; flags.push({type:"success",rule:"FOULS-W",msg:`${playerData.name} wins ${avg.toFixed(1)} fouls/game — above threshold.`});}
      else{ score-=20; flags.push({type:"warning",rule:"FOULS-W",msg:`${playerData.name} only wins ${avg.toFixed(1)} fouls/game — risky.`});}
    }
    // Dribbling forwards win more fouls
    if(playerData?.position==="FW"||playerData?.position==="AM"){ score+=8; flags.push({type:"success",rule:"FOULS-W",msg:"Attacking player in area — forwards win more fouls in the box."});}
  }

  // ── TOTAL MATCH FOULS ────────────────────────────────────────────────
  if(mkt.includes("Total Match Fouls")) {
    const threshold = mkt.includes("24.5") ? 24.5 : mkt.includes("22.5") ? 22.5 : 20.5;
    const combinedFouls = (parseFloat(rd?.homeFoulsAvg)||0)+(parseFloat(rd?.awayFoulsAvg)||0);
    if(combinedFouls >= threshold+2){ score+=20; flags.push({type:"success",rule:"FOULS-T",msg:`Combined fouls avg ${combinedFouls.toFixed(1)}/game — above ${threshold} threshold.`});}
    else if(combinedFouls >= threshold){ score+=8; flags.push({type:"success",rule:"FOULS-T",msg:`Combined fouls avg ${combinedFouls.toFixed(1)}/game — close to threshold.`});}
    else{ score-=20; flags.push({type:"danger",rule:"FOULS-T",msg:`Combined fouls avg only ${combinedFouls.toFixed(1)}/game — below ${threshold} threshold.`});}
    if(refCards>=4){ score+=10; flags.push({type:"success",rule:"FOULS-T",msg:`High-carding ref (${refCards}/game) tends to call more fouls.`});}
  }

  // ── TOTAL SHOTS MARKETS ──────────────────────────────────────────────
  if(mkt.includes("Total Shots")) {
    const threshold = mkt.includes("24.5") ? 24.5 : 22.5;
    const combinedShots = (parseFloat(rd?.homeShots)||0)+(parseFloat(rd?.awayShots)||0);
    if(combinedShots >= threshold+3){ score+=20; flags.push({type:"success",rule:"SHOTS-T",msg:`Combined shots avg ${combinedShots.toFixed(1)}/game — above ${threshold}.`});}
    else if(combinedShots >= threshold){ score+=8; flags.push({type:"success",rule:"SHOTS-T",msg:`Combined shots avg ${combinedShots.toFixed(1)}/game — on threshold.`});}
    else{ score-=20; flags.push({type:"danger",rule:"SHOTS-T",msg:`Combined shots avg only ${combinedShots.toFixed(1)}/game — below ${threshold}.`});}
  }

  // ── CORNERS MARKETS ──────────────────────────────────────────────────
  if(mkt.includes("Corner")) {
    const hC = parseFloat(rd?.homeCornersAvg)||0, aC = parseFloat(rd?.awayCornersAvg)||0;
    const combined = hC+aC;
    const threshold = mkt.includes("11.5") ? 11.5 : mkt.includes("10.5") ? 10.5 : mkt.includes("9.5") ? 9.5 : mkt.includes("8.5") ? 8.5 : 9;
    const isUnder = mkt.includes("Under");
    if(!isUnder) {
      if(combined >= threshold+2){ score+=20; flags.push({type:"success",rule:"CORNERS",msg:`Combined corners avg ${combined.toFixed(1)} — well above ${threshold} threshold.`});}
      else if(combined >= threshold){ score+=8; flags.push({type:"success",rule:"CORNERS",msg:`Combined corners avg ${combined.toFixed(1)} — above threshold.`});}
      else{ score-=25; flags.push({type:"danger",rule:"CORNERS",msg:`Combined corners avg only ${combined.toFixed(1)} — below ${threshold} threshold.`});}
    } else {
      if(combined <= threshold-2){ score+=20; flags.push({type:"success",rule:"CORNERS",msg:`Combined corners avg ${combined.toFixed(1)} — well below ${threshold} threshold — Under backed.`});}
      else{ score-=15; flags.push({type:"warning",rule:"CORNERS",msg:`Combined corners avg ${combined.toFixed(1)} — risky for Under ${threshold}.`});}
    }
    if(mkt.includes("Home Team")){ if(hC>=5){ score+=10; flags.push({type:"success",rule:"CORNERS",msg:`Home team avg ${hC.toFixed(1)} corners — above 4.5 threshold.`});} else{ score-=15; flags.push({type:"warning",rule:"CORNERS",msg:`Home team only avg ${hC.toFixed(1)} corners.`});}}
    if(mkt.includes("Away Team")){ if(aC>=5){ score+=10; flags.push({type:"success",rule:"CORNERS",msg:`Away team avg ${aC.toFixed(1)} corners — above 4.5 threshold.`});} else{ score-=15; flags.push({type:"warning",rule:"CORNERS",msg:`Away team only avg ${aC.toFixed(1)} corners.`});}}
  }

  // ── CARDS TOTALS ─────────────────────────────────────────────────────
  if(mkt.includes("Over 3.5 Cards")||mkt.includes("Over 4.5 Cards")||mkt.includes("Over 5.5 Cards")) {
    const threshold = mkt.includes("5.5") ? 5.5 : mkt.includes("4.5") ? 4.5 : 3.5;
    if(refCards>=threshold){ score+=20; flags.push({type:"success",rule:"CARDS-T",msg:`Referee avg ${refCards} cards/game — above ${threshold} threshold.`});}
    else if(refCards>0){ score-=15; flags.push({type:"warning",rule:"CARDS-T",msg:`Referee avg ${refCards} cards/game — below ${threshold} threshold.`});}
    if(isRelegation||isDerby){ score+=15; flags.push({type:"success",rule:"CARDS-T",msg:"High-stakes game boosts card likelihood."});}
  }

  // ── FIRST HALF GOALS ─────────────────────────────────────────────────
  if(mkt.includes("First Half Goals")||mkt.includes("BTTS First Half")) {
    const hFirstH = parseFloat(rd?.homeFirstHalfGoalsAvg)||0;
    const aFirstH = parseFloat(rd?.awayFirstHalfGoalsAvg)||0;
    const combined1H = hFirstH + aFirstH;
    const threshold = mkt.includes("1.5") ? 1.5 : 0.5;
    if(combined1H >= threshold+0.3){ score+=18; flags.push({type:"success",rule:"1H-GOALS",msg:`Combined first half avg ${combined1H.toFixed(2)} goals — above ${threshold} threshold.`});}
    else if(combined1H >= threshold){ score+=5; flags.push({type:"success",rule:"1H-GOALS",msg:`Combined first half avg ${combined1H.toFixed(2)} goals — on threshold.`});}
    else{ score-=20; flags.push({type:"danger",rule:"1H-GOALS",msg:`Combined first half avg only ${combined1H.toFixed(2)} goals — below ${threshold}.`});}
    if(isRelegation){ score+=10; flags.push({type:"success",rule:"1H-GOALS",msg:"Relegation decider — teams come out hard from the first whistle."});}
  }

  // ── HALF TIME RESULT ─────────────────────────────────────────────────
  if(mkt.includes("Half Time")) {
    score+=0; // Neutral starting point — context dependent
    flags.push({type:"warning",rule:"HT",msg:"Half time result markets need first-half form data — check team's HT records manually on Footystats."});
  }

  // ── ASSISTS ──────────────────────────────────────────────────────────
  if(mkt.includes("Assists")) {
    const player = leg.playerName?.toLowerCase()||"";
    const playerData = [...(rd?.homePlayers||[]),(rd?.awayPlayers||[])].find(p=>p.name?.toLowerCase().includes(player.split(" ").pop()||"X"));
    if(playerData?.assistsPerGame) {
      if(playerData.assistsPerGame>=0.3){ score+=18; flags.push({type:"success",rule:"ASSISTS",msg:`${playerData.name} averaging ${playerData.assistsPerGame.toFixed(2)} assists/game — strong for 1+ market.`});}
      else{ score-=15; flags.push({type:"warning",rule:"ASSISTS",msg:`${playerData.name} only ${playerData.assistsPerGame.toFixed(2)} assists/game — risky.`});}
    } else {
      flags.push({type:"warning",rule:"ASSISTS",msg:"No player assist data — check manually on Understat or FBref."});
    }
    if(cXg>=2.5){ score+=8; flags.push({type:"success",rule:"ASSISTS",msg:"High xG game — more chances created means more assist opportunities."});}
  }

  // ── CLEAN SHEET ──────────────────────────────────────────────────────
  if(mkt.includes("Clean Sheet")) {
    const isHome = mkt.includes("Home");
    const xgA = isHome ? aXg : hXg;
    if(xgA < 0.8){ score+=20; flags.push({type:"success",rule:"CS",msg:`${isHome?"Away":"Home"} team xG avg ${xgA.toFixed(2)} — low threat. Clean sheet well backed.`});}
    else if(xgA < 1.2){ score+=5; flags.push({type:"success",rule:"CS",msg:`${isHome?"Away":"Home"} xG ${xgA.toFixed(2)} — moderate threat.`});}
    else{ score-=20; flags.push({type:"danger",rule:"CS",msg:`${isHome?"Away":"Home"} xG ${xgA.toFixed(2)} — too high for clean sheet market.`});}
    if(isRelegation){ score-=15; flags.push({type:"danger",rule:"CS",msg:"Relegation decider — both teams attack desperately. Clean sheets rare."});}
  }

  // ── HOME/AWAY TEAM CARDS ─────────────────────────────────────────────
  if(mkt.includes("Home Team Over 1.5 Cards")||mkt.includes("Away Team Over 1.5 Cards")) {
    const isHome = mkt.includes("Home");
    const avg = isHome ? (parseFloat(rd?.homeCardsAvg)||0) : (parseFloat(rd?.awayCardsAvg)||0);
    if(avg >= 2){ score+=18; flags.push({type:"success",rule:"CARDS-TEAM",msg:`${isHome?"Home":"Away"} team avg ${avg.toFixed(1)} cards/game — above 1.5 threshold.`});}
    else if(avg >= 1.5){ score+=5; flags.push({type:"success",rule:"CARDS-TEAM",msg:`${isHome?"Home":"Away"} team avg ${avg.toFixed(1)} cards/game — on threshold.`});}
    else{ score-=15; flags.push({type:"warning",rule:"CARDS-TEAM",msg:`${isHome?"Home":"Away"} team only avg ${avg.toFixed(1)} cards/game.`});}
    if(refCards>=4){ score+=10; flags.push({type:"success",rule:"CARDS-TEAM",msg:`High-carding ref (${refCards}/game) backs this market.`});}
  }

  // xG boost
  if(aXg>=1.2&&(mkt==="BTTS"||mkt==="Both Teams & Over 2.5")){score+=10;flags.push({type:"success",rule:"xG+",msg:`Away xG ${aXg.toFixed(2)} — above 1.0 threshold.`});}

  // Learned from history
  const ms=stats.marketHits[mkt];
  if(ms&&ms.attempts>=5){const hr=ms.wins/ms.attempts;if(hr>=0.65){score+=12;flags.push({type:"success",rule:"LEARNED",msg:`📈 ${mkt} landing ${Math.round(hr*100)}% across ${ms.attempts} legs.`});}else if(hr<=0.35){score-=15;flags.push({type:"warning",rule:"LEARNED",msg:`📉 ${mkt} only ${Math.round(hr*100)}% across ${ms.attempts} legs.`});}}
  const cs=stats.contextHits[match.context];
  if(cs&&cs.attempts>=3){const hr=cs.wins/cs.attempts;if(hr>=0.6){score+=8;flags.push({type:"success",rule:"LEARNED",msg:`📈 "${match.context}" ${Math.round(hr*100)}% BAB win rate in your history.`});}else if(hr<=0.3){score-=10;flags.push({type:"warning",rule:"LEARNED",msg:`📉 "${match.context}" only ${Math.round(hr*100)}% in your history.`});}}

  // Patterns from post-match intelligence
  if(patterns?.length>0){
    patterns.filter(p=>p.active&&(p.market===mkt||p.market==="All")&&(p.context===match.context||p.context==="All"||!p.context)).forEach(p=>{
      if(p.direction==="positive"){score+=p.strength||10;flags.push({type:"success",rule:"PATTERN",msg:`📊 Pattern: ${p.description} (${p.gamesTracked} games tracked, ${p.hitRate}% hit rate)`});}
      else{score-=p.strength||10;flags.push({type:"warning",rule:"PATTERN",msg:`📊 Pattern: ${p.description} (${p.gamesTracked} games, ${p.hitRate}% hit rate)`});}
    });
  }

  return { score:Math.max(0,Math.min(100,score)), flags, verdict:score>=65?"BACK IT":score>=40?"THINK TWICE":"AVOID" };
}

// ─── STAGE LABELS ─────────────────────────────────────────────────────────
const RESEARCH_STAGES = ["Identifying fixture...","Fetching xG & shot data...","Analysing goals trends...","Checking corners, cards & fouls...","Fetching referee season stats...","Pulling H2H records...","Checking injury & suspension news...","Detecting match context...","Generating BAB leg suggestions..."];
const MATCHDAY_STAGES = ["Searching for confirmed lineups...","Verifying starting XIs...","Checking late injury news...","Fetching referee confirmation...","Cross-referencing legs with XIs...","Adjusting recommendations...","Finalising matchday intelligence..."];
const POSTMATCH_STAGES = ["Searching for full match stats...","Fetching player statistics...","Analysing corners & cards data...","Comparing to pre-match predictions...","Scanning for emerging patterns...","Generating pattern recommendations...","Building intelligence summary..."];

// Pre-loaded match data — ALL 10 Premier League Final Day fixtures 24 May 2026
const PRELOADED_DATA = {
  "Tottenham-Everton": {
    home:"Tottenham",away:"Everton",league:"Premier League",matchDate:"24 May 2026",kickoffTime:"4:00pm BST",venue:"Tottenham Hotspur Stadium",
    context:"Final Day — Relegation Decider",
    contextReason:"Spurs need 1pt to survive. West Ham 2pts behind with terrible GD. Everton confirmed mid-table — Moyes confirmed full-strength side.",
    homeXg:"1.21",awayXg:"1.08",homeXgA:"1.65",awayXgA:"1.31",
    homeShots:"12.4",awayShots:"10.8",homeShotsOnTarget:"3.8",awayShotsOnTarget:"3.4",
    homeCornersAvg:"4.8",awayCornersAvg:"4.4",homeBTTSRate:"47",awayBTTSRate:"62",
    homeOver25Rate:"44",awayOver25Rate:"56",homeCardsAvg:"1.8",awayCardsAvg:"1.9",
    homeFoulsAvg:"10.2",awayFoulsAvg:"11.1",homeGoalsScored:"1.18",awayGoalsScored:"1.26",
    homeGoalsConceded:"1.58",awayGoalsConceded:"1.35",
    homeForm:["L","D","L","D","L"],awayForm:["L","L","D","L","L"],
    h2hLast5:"Spurs 3-0 Oct 2025. Last 4 home H2H: Spurs 13-1 aggregate",h2hBTTS:false,h2hOver25:true,
    referee:"Michael Oliver",refereeCardsAvg:"4.1",refereeFoulsAvg:"22.3",refereeYellowsAvg:"3.9",refereeRedsAvg:"0.18",refereePenaltiesRate:"0.28",refereeHomeAdvantage:"Balanced — slightly more away cards",refereeSeasonGames:"28",
    predictedHomeXI:["Kinsky","Porro","Danso","Van de Ven","Udogie","Bentancur","Palhinha","Kolo Muani","Gallagher","Tel","Richarlison"],
    predictedAwayXI:["Pickford","O'Brien","Tarkowski","Keane","Mykolenko","Garner","Iroegbunam","Rohl","Dewsbury-Hall","Ndiaye","Beto"],
    keyInjuries:["Solanke — Spurs — fitness doubt","Maddison — Spurs — knee, bench only","Branthwaite — Everton — out","Gueye — Everton — out","Grealish — Everton — out"],
    keySuspensions:[],
    homePlayers:[
      {name:"Pedro Porro",position:"DEF",shotsPerGame:1.0,sotPerGame:0.25,foulsCommittedPerGame:1.03,foulsWonPerGame:0.4,assistsPerGame:0.07,goalsPerGame:0.04,yellowCards:10},
      {name:"Richarlison",position:"FW",shotsPerGame:2.1,sotPerGame:0.8,foulsCommittedPerGame:0.8,foulsWonPerGame:1.8,assistsPerGame:0.15,goalsPerGame:0.35,yellowCards:3},
      {name:"Rodrigo Bentancur",position:"MID",shotsPerGame:0.8,sotPerGame:0.3,foulsCommittedPerGame:1.4,foulsWonPerGame:0.8,assistsPerGame:0.12,goalsPerGame:0.08,yellowCards:5},
      {name:"Conor Gallagher",position:"MID",shotsPerGame:1.2,sotPerGame:0.4,foulsCommittedPerGame:1.6,foulsWonPerGame:1.0,assistsPerGame:0.18,goalsPerGame:0.12,yellowCards:6},
      {name:"Kolo Muani",position:"FW",shotsPerGame:1.8,sotPerGame:0.7,foulsCommittedPerGame:0.6,foulsWonPerGame:1.4,assistsPerGame:0.2,goalsPerGame:0.28,yellowCards:2},
    ],
    awayPlayers:[
      {name:"Beto",position:"FW",shotsPerGame:1.8,sotPerGame:0.6,foulsCommittedPerGame:1.2,foulsWonPerGame:2.1,assistsPerGame:0.08,goalsPerGame:0.22,yellowCards:4},
      {name:"Ndiaye",position:"MID",shotsPerGame:1.4,sotPerGame:0.5,foulsCommittedPerGame:0.8,foulsWonPerGame:1.6,assistsPerGame:0.24,goalsPerGame:0.18,yellowCards:3},
      {name:"Garner",position:"MID",shotsPerGame:0.7,sotPerGame:0.25,foulsCommittedPerGame:1.8,foulsWonPerGame:0.9,assistsPerGame:0.14,goalsPerGame:0.06,yellowCards:7},
      {name:"Dewsbury-Hall",position:"MID",shotsPerGame:0.9,sotPerGame:0.35,foulsCommittedPerGame:1.2,foulsWonPerGame:1.1,assistsPerGame:0.22,goalsPerGame:0.1,yellowCards:4},
      {name:"Keane",position:"DEF",shotsPerGame:0.4,sotPerGame:0.1,foulsCommittedPerGame:0.9,foulsWonPerGame:0.3,assistsPerGame:0.04,goalsPerGame:0.05,yellowCards:3},
    ],
    homeFirstHalfGoalsAvg:0.52,awayFirstHalfGoalsAvg:0.48,
    suggestedLegs:[
      {market:"BTTS",playerName:"",detail:"Everton scored in 7 straight. Spurs need a result. Both teams attacking. Relegation decider — maximum motivation both sides.",confidence:"HIGH",dataPoint:"Everton no CS in 6 straight, 62% away BTTS rate"},
      {market:"Player 1+ Fouls Committed",playerName:"Rodrigo Bentancur",detail:"Bentancur confirmed starting — 1.4 fouls/game. High-intensity relegation game under Oliver (4.1 cards/game). Will fly into challenges.",confidence:"HIGH",dataPoint:"Bentancur 1.4 fouls/game, Oliver 4.1 cards/game"},
      {market:"Player Cards",playerName:"Pedro Porro",detail:"Porro confirmed in squad — 10 PL yellows this season. Michael Oliver avg 4.1 cards/game. Even in midfield role Porro is aggressive.",confidence:"HIGH",dataPoint:"Porro 10 PL yellows, Oliver 4.1 cards/game"},
      {market:"Player 1+ Fouls Won",playerName:"Beto",detail:"Beto confirmed starting for Everton — physical striker who wins 2.1 fouls/game. Will battle Spurs' defence all afternoon.",confidence:"HIGH",dataPoint:"Beto confirmed starting, 2.1 fouls won/game"},
    ],
    intelligenceSummary:"Tottenham desperately need a point but have won only 2 of 18 home PL games this season — worst home record in their modern history. Michael Oliver is a high-carding referee averaging 4.1 per game, making Pedro Porro (10 PL yellows) a standout cards pick. Everton have failed to keep a clean sheet in 6 consecutive matches and scored in 7 straight — BTTS looks well supported. Moyes confirmed full-strength Everton. Richarlison leads Spurs attack against his former club.",
    biggestRisk:"Spurs go 1-0 up early and park the bus for a 1-0 win — BTTS and Over 2.5 both fail. Their home draws this season show they can defend when ahead.",
    dataConfidence:"HIGH",dataSource:"WhoScored, Opta Analyst, Sky Sports, 101 Great Goals, Read Everton"
  },
  "WestHam-Leeds": {
    home:"West Ham",away:"Leeds United",league:"Premier League",matchDate:"24 May 2026",kickoffTime:"4:00pm BST",venue:"London Stadium",
    context:"Final Day — Relegation Decider",
    contextReason:"West Ham must win AND hope Spurs lose. 2pts behind Spurs with vastly inferior GD. Leeds safe in 14th, unbeaten in 8.",
    homeXg:"1.18",awayXg:"1.35",homeXgA:"1.72",awayXgA:"1.28",
    homeShots:"11.2",awayShots:"13.1",homeShotsOnTarget:"3.2",awayShotsOnTarget:"4.1",
    homeCornersAvg:"5.1",awayCornersAvg:"5.3",homeBTTSRate:"58",awayBTTSRate:"52",
    homeOver25Rate:"54",awayOver25Rate:"58",homeCardsAvg:"2.1",awayCardsAvg:"1.8",
    homeFoulsAvg:"11.4",awayFoulsAvg:"10.8",homeGoalsScored:"1.24",awayGoalsScored:"1.41",
    homeGoalsConceded:"1.68",awayGoalsConceded:"1.21",
    homeForm:["L","L","L","W","W"],awayForm:["W","D","D","W","W"],
    h2hLast5:"West Ham W 2-0 PL. Drew 2-2 FA Cup QF (Leeds won pens)",h2hBTTS:true,h2hOver25:true,
    referee:"Anthony Taylor",refereeCardsAvg:"3.97",refereeFoulsAvg:"20.33",refereeYellowsAvg:"3.8",refereeRedsAvg:"0.1",refereePenaltiesRate:"0.22",refereeHomeAdvantage:"Balanced — 30 PL games this season, most of any ref",refereeSeasonGames:"30",
    predictedHomeXI:["Hermansen","Wan-Bissaka","Mavropanos","Disasi","Diouf","Soucek","Fernandes","Bowen","Pablo","Summerville","Castellanos"],
    predictedAwayXI:["Meslier","Kristensen","Rodon","Wober","Firpo","Ampadu","Gruev","Gnonto","Aaronson","Sinisterra","Piroe"],
    keyInjuries:["Adama Traore — West Ham — muscle doubt","Anton Stach — Leeds — injured","Okafor — Leeds — doubt","Bogle — Leeds — doubt","Struijk — Leeds — doubt"],
    keySuspensions:[],
    homePlayers:[
      {name:"Jarrod Bowen",position:"FW",shotsPerGame:2.4,sotPerGame:0.9,foulsCommittedPerGame:0.6,foulsWonPerGame:2.2,assistsPerGame:0.38,goalsPerGame:0.28,yellowCards:2},
      {name:"Tomas Soucek",position:"MID",shotsPerGame:1.1,sotPerGame:0.4,foulsCommittedPerGame:1.8,foulsWonPerGame:0.7,assistsPerGame:0.12,goalsPerGame:0.18,yellowCards:6},
      {name:"Crysencio Summerville",position:"FW",shotsPerGame:2.2,sotPerGame:0.85,foulsCommittedPerGame:0.5,foulsWonPerGame:2.8,assistsPerGame:0.22,goalsPerGame:0.32,yellowCards:3},
      {name:"Mateus Fernandes",position:"MID",shotsPerGame:0.8,sotPerGame:0.3,foulsCommittedPerGame:1.4,foulsWonPerGame:1.2,assistsPerGame:0.18,goalsPerGame:0.08,yellowCards:4},
      {name:"Valentin Castellanos",position:"FW",shotsPerGame:1.9,sotPerGame:0.7,foulsCommittedPerGame:1.1,foulsWonPerGame:1.6,assistsPerGame:0.14,goalsPerGame:0.25,yellowCards:3},
    ],
    awayPlayers:[
      {name:"Georginio Rutter",position:"FW",shotsPerGame:2.1,sotPerGame:0.8,foulsCommittedPerGame:0.7,foulsWonPerGame:2.4,assistsPerGame:0.28,goalsPerGame:0.3,yellowCards:2},
      {name:"Willy Gnonto",position:"FW",shotsPerGame:1.8,sotPerGame:0.7,foulsCommittedPerGame:0.6,foulsWonPerGame:2.6,assistsPerGame:0.24,goalsPerGame:0.22,yellowCards:2},
      {name:"Ilia Gruev",position:"MID",shotsPerGame:0.7,sotPerGame:0.25,foulsCommittedPerGame:1.6,foulsWonPerGame:0.8,assistsPerGame:0.15,goalsPerGame:0.06,yellowCards:6},
      {name:"Ethan Ampadu",position:"MID",shotsPerGame:0.5,sotPerGame:0.18,foulsCommittedPerGame:1.9,foulsWonPerGame:0.6,assistsPerGame:0.12,goalsPerGame:0.04,yellowCards:8},
      {name:"Joel Piroe",position:"FW",shotsPerGame:1.7,sotPerGame:0.65,foulsCommittedPerGame:0.8,foulsWonPerGame:1.4,assistsPerGame:0.16,goalsPerGame:0.28,yellowCards:2},
    ],
    homeFirstHalfGoalsAvg:0.58,awayFirstHalfGoalsAvg:0.62,
    suggestedLegs:[
      {market:"Over 2.5 Goals",playerName:"",detail:"West Ham MUST win — attack from kick off. Leeds scored 7 in last 5. Taylor 3.97 cards/game. H2H over 2.5 in majority.",confidence:"HIGH",dataPoint:"West Ham must win, Leeds 7 goals last 5"},
      {market:"BTTS",playerName:"",detail:"West Ham 58% home BTTS. Leeds in brilliant scoring form. West Ham cannot sit back — must attack every minute.",confidence:"HIGH",dataPoint:"West Ham 58% BTTS home rate"},
      {market:"Player 1+ Fouls Won",playerName:"Crysencio Summerville",detail:"Summerville confirmed starting — wins 2.8 fouls/game. Dribbling winger in desperate home relegation game. Perfect profile for fouls won market.",confidence:"HIGH",dataPoint:"Summerville confirmed starting, 2.8 fouls won/game"},
      {market:"Player 1+ Fouls Committed",playerName:"Ethan Ampadu",detail:"Ampadu confirmed starting for Leeds — 1.9 fouls/game. Physical midfielder flying into challenges under Taylor (3.97 cards/game).",confidence:"HIGH",dataPoint:"Ampadu 1.9 fouls/game, Taylor 3.97 cards/game"},
    ],
    intelligenceSummary:"West Ham have lost 3 in a row and scored just 3 goals in their last 5 PL matches. But they have a strong final-day home record (11 wins from last 19). Leeds are safe, unbeaten in 8, scored 7 in last 5. Anthony Taylor averaging nearly 4 cards per game — cards markets backed. Bowen is West Ham's key man with 10 assists. Leeds have several injury doubts. West Ham will attack desperately from the first minute — the game-state dynamics heavily favour an open, high-scoring game.",
    biggestRisk:"Leeds have nothing to play for — they could be defensively passive and let West Ham dominate without proper intensity, making goals markets harder despite the stats.",
    dataConfidence:"HIGH",dataSource:"Yorkshire Evening Post, Opta Analyst, Football Whispers, ESPN, Read West Ham"
  },
  "Brighton-ManUnited": {
    home:"Brighton",away:"Manchester United",league:"Premier League",matchDate:"24 May 2026",kickoffTime:"4:00pm BST",venue:"Amex Stadium",
    context:"Final Day — European Chase",
    contextReason:"Brighton need a win to guarantee European football. Man Utd in 3rd (CL confirmed), nothing to play for. Casemiro's farewell appearance.",
    homeXg:"1.52",awayXg:"1.38",homeXgA:"1.21",awayXgA:"1.18",
    homeShots:"14.2",awayShots:"13.1",homeShotsOnTarget:"4.8",awayShotsOnTarget:"4.2",
    homeCornersAvg:"5.8",awayCornersAvg:"5.2",homeBTTSRate:"55",awayBTTSRate:"58",
    homeOver25Rate:"61",awayOver25Rate:"58",homeCardsAvg:"1.7",awayCardsAvg:"1.9",
    homeFoulsAvg:"10.8",awayFoulsAvg:"11.2",homeGoalsScored:"1.48",awayGoalsScored:"1.62",
    homeGoalsConceded:"1.21",awayGoalsConceded:"1.18",
    homeForm:["L","W","W","W","D"],awayForm:["W","D","W","W","D"],
    h2hLast5:"Brighton won 67% of last 6 H2H. Utd lost 3 of last 4 away at Brighton",h2hBTTS:true,h2hOver25:true,
    referee:"Unknown",refereeCardsAvg:null,refereeFoulsAvg:null,refereeYellowsAvg:null,refereeRedsAvg:null,refereePenaltiesRate:null,refereeHomeAdvantage:null,refereeSeasonGames:null,
    predictedHomeXI:["Verbruggen","Wieffer","Dunk","Van Hecke","De Cuyper","Baleba","Gross","Kadioglu","Hinshelwood","Minteh","Welbeck"],
    predictedAwayXI:["Lammens","Dalot","Maguire","Martinez","Shaw","Casemiro","Mainoo","Diallo","Fernandes","Cunha","Mbeumo"],
    keyInjuries:["De Ligt — Man Utd — out for season","Sesko — Man Utd — shin injury doubt"],
    keySuspensions:[],
    homePlayers:[
      {name:"Danny Welbeck",position:"FW",shotsPerGame:2.2,sotPerGame:0.85,foulsCommittedPerGame:0.8,foulsWonPerGame:2.4,assistsPerGame:0.18,goalsPerGame:0.38,yellowCards:3},
      {name:"Yankuba Minteh",position:"FW",shotsPerGame:2.0,sotPerGame:0.72,foulsCommittedPerGame:0.6,foulsWonPerGame:2.8,assistsPerGame:0.22,goalsPerGame:0.25,yellowCards:2},
      {name:"Jack Hinshelwood",position:"MID",shotsPerGame:0.9,sotPerGame:0.32,foulsCommittedPerGame:1.2,foulsWonPerGame:1.0,assistsPerGame:0.2,goalsPerGame:0.1,yellowCards:4},
      {name:"Pascal Gross",position:"MID",shotsPerGame:0.8,sotPerGame:0.3,foulsCommittedPerGame:0.8,foulsWonPerGame:0.9,assistsPerGame:0.28,goalsPerGame:0.08,yellowCards:3},
      {name:"Carlos Baleba",position:"MID",shotsPerGame:0.7,sotPerGame:0.25,foulsCommittedPerGame:1.8,foulsWonPerGame:0.7,assistsPerGame:0.12,goalsPerGame:0.06,yellowCards:7},
    ],
    awayPlayers:[
      {name:"Bryan Mbeumo",position:"FW",shotsPerGame:2.26,sotPerGame:1.11,foulsCommittedPerGame:0.85,foulsWonPerGame:1.4,assistsPerGame:0.11,goalsPerGame:0.37,yellowCards:4},
      {name:"Matheus Cunha",position:"FW",shotsPerGame:2.1,sotPerGame:0.82,foulsCommittedPerGame:0.9,foulsWonPerGame:1.8,assistsPerGame:0.22,goalsPerGame:0.32,yellowCards:5},
      {name:"Bruno Fernandes",position:"MID",shotsPerGame:1.8,sotPerGame:0.65,foulsCommittedPerGame:1.1,foulsWonPerGame:1.4,assistsPerGame:0.42,goalsPerGame:0.22,yellowCards:6},
      {name:"Amad Diallo",position:"FW",shotsPerGame:1.6,sotPerGame:0.6,foulsCommittedPerGame:0.7,foulsWonPerGame:1.6,assistsPerGame:0.28,goalsPerGame:0.2,yellowCards:2},
      {name:"Kobbie Mainoo",position:"MID",shotsPerGame:0.8,sotPerGame:0.28,foulsCommittedPerGame:1.3,foulsWonPerGame:0.8,assistsPerGame:0.2,goalsPerGame:0.1,yellowCards:5},
    ],
    homeFirstHalfGoalsAvg:0.62,awayFirstHalfGoalsAvg:0.55,
    suggestedLegs:[
      {market:"Over 2.5 Goals",playerName:"",detail:"Brighton 61% Over 2.5 at home. Man Utd 1.62 goals/game away. Brighton must win for European place — will attack relentlessly.",confidence:"HIGH",dataPoint:"Brighton 61% home Over 2.5, Utd 1.62 away goals/game"},
      {market:"BTTS",playerName:"",detail:"Brighton 55% home BTTS. Man Utd 58% away BTTS. Brighton need to win so attack hard. Utd dangerous on counter.",confidence:"HIGH",dataPoint:"Brighton 55% BTTS, Utd 58% away BTTS"},
      {market:"Player 2+ Shots on Target",playerName:"Bryan Mbeumo",detail:"Mbeumo confirmed starting — 1.11 SOT/game this season. 30 SOT in 27 games. Elite finisher in a game Utd must attack into.",confidence:"HIGH",dataPoint:"Mbeumo 1.11 SOT/game, confirmed starting"},
      {market:"Player 1+ Fouls Committed",playerName:"Carlos Baleba",detail:"Baleba confirmed starting — 1.8 fouls committed/game. Brighton's aggressive midfield enforcer in a must-win game.",confidence:"HIGH",dataPoint:"Baleba 1.8 fouls/game, confirmed starting"},
    ],
    intelligenceSummary:"Brighton desperately need a win to secure European football. Man Utd have CL confirmed and nothing to play for — Casemiro plays his final game. Brighton have won 67% of last 6 H2H meetings. Under 2.5 goals has landed in 6 of Brighton's last 10 home games but both teams are in strong goalscoring form and Brighton need to win. This is an open, attacking game with the hosts motivated and Utd likely to play freely.",
    biggestRisk:"Man Utd arrive relaxed with nothing to play for and soak up Brighton's pressure before hitting them on the counter — a 1-0 or 2-0 Utd win is very feasible given their counter-attacking threat.",
    dataConfidence:"HIGH",dataSource:"Yahoo Sports, WhoScored, 101 Great Goals, Football365, Dimers"
  },
  "CrystalPalace-Arsenal": {
    home:"Crystal Palace",away:"Arsenal",league:"Premier League",matchDate:"24 May 2026",kickoffTime:"4:00pm BST",venue:"Selhurst Park",
    context:"Final Day",
    contextReason:"Arsenal are PL champions — victory lap. Palace have nothing to play for domestically but are preparing for the Conference League final. Arsenal will want to celebrate. Rotation risk for Arsenal.",
    homeXg:"1.08",awayXg:"1.82",homeXgA:"1.48",awayXgA:"0.88",
    homeShots:"10.2",awayShots:"15.8",homeShotsOnTarget:"3.1",awayShotsOnTarget:"5.4",
    homeCornersAvg:"4.2",awayCornersAvg:"6.8",homeBTTSRate:"42",awayBTTSRate:"51",
    homeOver25Rate:"38",awayOver25Rate:"54",homeCardsAvg:"1.8",awayCardsAvg:"1.5",
    homeFoulsAvg:"11.2",awayFoulsAvg:"9.8",homeGoalsScored:"1.08",awayGoalsScored:"1.88",
    homeGoalsConceded:"1.48",awayGoalsConceded:"0.88",
    homeForm:["D","L","D","W","D"],awayForm:["W","W","W","D","W"],
    h2hLast5:"Arsenal dominated recent H2H. Palace won just 1 of last 8 PL meetings with Arsenal",h2hBTTS:false,h2hOver25:false,
    referee:"Unknown",refereeCardsAvg:null,refereeFoulsAvg:null,refereeYellowsAvg:null,refereeRedsAvg:null,refereePenaltiesRate:null,refereeHomeAdvantage:null,refereeSeasonGames:null,
    predictedHomeXI:["Henderson","Riad","Lacroix","Canvot","Mitchell","Hughes","Lerma","Munoz","Johnson","Pino","Strand Larsen"],
    predictedAwayXI:["Raya","Hincapie","Gabriel","Norgaard","Mosquera","Zubimendi","Lewis-Skelly","Martinelli","Eze","Madueke","Jesus"],
    keyInjuries:["Arsenal likely to rotate some players — title already won"],
    keySuspensions:[],
    homePlayers:[
      {name:"Brennan Johnson",position:"AM",shotsPerGame:1.8,sotPerGame:0.65,foulsCommittedPerGame:0.6,foulsWonPerGame:1.8,assistsPerGame:0.22,goalsPerGame:0.22,yellowCards:3},
      {name:"Brennan Johnson",position:"AM",shotsPerGame:1.8,sotPerGame:0.65,foulsCommittedPerGame:0.6,foulsWonPerGame:1.8,assistsPerGame:0.22,goalsPerGame:0.22,yellowCards:3},
      {name:"Jorgen Strand Larsen",position:"FW",shotsPerGame:2.0,sotPerGame:0.72,foulsCommittedPerGame:1.2,foulsWonPerGame:1.9,assistsPerGame:0.12,goalsPerGame:0.28,yellowCards:4},
      {name:"Jefferson Lerma",position:"MID",shotsPerGame:0.5,sotPerGame:0.18,foulsCommittedPerGame:2.0,foulsWonPerGame:0.6,assistsPerGame:0.1,goalsPerGame:0.05,yellowCards:8},
      {name:"Yeremy Pino",position:"FW",shotsPerGame:1.9,sotPerGame:0.7,foulsCommittedPerGame:0.7,foulsWonPerGame:2.1,assistsPerGame:0.24,goalsPerGame:0.25,yellowCards:2},
    ],
    awayPlayers:[
      {name:"Bukayo Saka",position:"FW",shotsPerGame:2.8,sotPerGame:1.05,foulsCommittedPerGame:0.5,foulsWonPerGame:2.8,assistsPerGame:0.42,goalsPerGame:0.38,yellowCards:2},
      {name:"Kai Havertz",position:"FW",shotsPerGame:2.0,sotPerGame:0.75,foulsCommittedPerGame:0.8,foulsWonPerGame:1.6,assistsPerGame:0.22,goalsPerGame:0.35,yellowCards:3},
      {name:"Martin Odegaard",position:"AM",shotsPerGame:1.8,sotPerGame:0.65,foulsCommittedPerGame:0.6,foulsWonPerGame:1.2,assistsPerGame:0.45,goalsPerGame:0.22,yellowCards:3},
      {name:"Gabriel Martinelli",position:"FW",shotsPerGame:2.2,sotPerGame:0.8,foulsCommittedPerGame:0.7,foulsWonPerGame:2.4,assistsPerGame:0.28,goalsPerGame:0.3,yellowCards:2},
      {name:"Thomas Partey",position:"MID",shotsPerGame:0.6,sotPerGame:0.22,foulsCommittedPerGame:1.6,foulsWonPerGame:0.7,assistsPerGame:0.14,goalsPerGame:0.06,yellowCards:6},
    ],
    homeFirstHalfGoalsAvg:0.44,awayFirstHalfGoalsAvg:0.68,
    suggestedLegs:[
      {market:"Player 1+ Fouls Committed",playerName:"Jefferson Lerma",detail:"Lerma confirmed starting — 2.0 fouls committed/game. Palace enforcer will be busy against Arsenal's quick forwards Martinelli and Madueke.",confidence:"HIGH",dataPoint:"Lerma confirmed starting, 2.0 fouls committed/game"},
      {market:"Player 1+ Fouls Won",playerName:"Gabriel Martinelli",detail:"Martinelli confirmed starting on left for Arsenal — direct winger who draws fouls. 2.2 shots/game. Arsenal celebrating, will attack freely.",confidence:"HIGH",dataPoint:"Martinelli confirmed starting, direct winger"},
      {market:"Anytime Scorer",playerName:"Gabriel Jesus",detail:"Jesus confirmed leading Arsenal attack. Against Palace's mid-table rotated defence, Arsenal will create chances. Jesus their main striker.",confidence:"MEDIUM",dataPoint:"Jesus confirmed starting, leads Arsenal attack"},
      {market:"Over 2.5 Goals",playerName:"",detail:"Arsenal 54% Over 2.5 away. Palace Conference League final on Wednesday — may not want injuries. But Arsenal will celebrate and attack.",confidence:"MEDIUM",dataPoint:"Arsenal 54% Over 2.5 away, celebrating title"},
    ],
    intelligenceSummary:"Arsenal are celebrating their first title in 22 years — this is a victory lap at Selhurst Park. Palace have nothing to play for and have been inconsistent at home. Arsenal are massive favourites but may rotate key players which dampens the goals market. Palace at home to Arsenal in recent years have been tight, low-scoring games. Under 2.5 goals has landed in 6 of Palace's last 10 home games. Arteta will want a celebration win.",
    biggestRisk:"Arsenal rotate 4-5 players, Palace are well-organised defensively, and this ends 1-0 to Arsenal — a flat finale with few goals.",
    dataConfidence:"HIGH",dataSource:"Dimers, Dailysports, Sky Sports, Squawka, Opta Analyst"
  },
  "Burnley-Wolves": {
    home:"Burnley",away:"Wolves",league:"Premier League",matchDate:"24 May 2026",kickoffTime:"4:00pm BST",venue:"Turf Moor",
    context:"Final Day",
    contextReason:"Both mid-table with nothing significant at stake. Burnley safe, Wolves safe. Classic nothing-to-play-for final day game.",
    homeXg:"1.12",awayXg:"1.08",homeXgA:"1.68",awayXgA:"1.58",
    homeShots:"10.8",awayShots:"10.2",homeShotsOnTarget:"3.2",awayShotsOnTarget:"3.1",
    homeCornersAvg:"4.6",awayCornersAvg:"4.2",homeBTTSRate:"48",awayBTTSRate:"44",
    homeOver25Rate:"46",awayOver25Rate:"42",homeCardsAvg:"2.1",awayCardsAvg:"1.9",
    homeFoulsAvg:"12.2",awayFoulsAvg:"11.8",homeGoalsScored:"1.15",awayGoalsScored:"1.08",
    homeGoalsConceded:"1.68",awayGoalsConceded:"1.58",
    homeForm:["D","L","W","D","L"],awayForm:["D","W","D","L","D"],
    h2hLast5:"Mixed recent H2H — evenly matched",h2hBTTS:true,h2hOver25:false,
    referee:"Unknown",refereeCardsAvg:null,refereeFoulsAvg:null,refereeYellowsAvg:null,refereeRedsAvg:null,refereePenaltiesRate:null,refereeHomeAdvantage:null,refereeSeasonGames:null,
    predictedHomeXI:["Flekken","Roberts","Esteve","Harwood-Bellis","Vitinho","Cullen","Brownhill","Berge","Al-Dakhil","Barnes","Rodriguez"],
    predictedAwayXI:["Sa","Semedo","Dawson","Toti","Ait-Nouri","Joao Gomes","Lemina","Sarabia","Guedes","Cunha","Hwang"],
    keyInjuries:["Several Wolves doubts from long injury list"],
    keySuspensions:[],
    homePlayers:[
      {name:"Lyle Foster",position:"FW",shotsPerGame:1.8,sotPerGame:0.65,foulsCommittedPerGame:0.8,foulsWonPerGame:1.8,assistsPerGame:0.12,goalsPerGame:0.25,yellowCards:3},
      {name:"Josh Brownhill",position:"MID",shotsPerGame:1.2,sotPerGame:0.42,foulsCommittedPerGame:1.6,foulsWonPerGame:0.8,assistsPerGame:0.2,goalsPerGame:0.14,yellowCards:6},
      {name:"Sander Berge",position:"MID",shotsPerGame:0.8,sotPerGame:0.28,foulsCommittedPerGame:1.8,foulsWonPerGame:0.7,assistsPerGame:0.18,goalsPerGame:0.08,yellowCards:7},
      {name:"Hannibal Mejbri",position:"MID",shotsPerGame:1.0,sotPerGame:0.35,foulsCommittedPerGame:1.4,foulsWonPerGame:1.2,assistsPerGame:0.22,goalsPerGame:0.1,yellowCards:5},
      {name:"Dara O'Shea",position:"DEF",shotsPerGame:0.4,sotPerGame:0.12,foulsCommittedPerGame:1.2,foulsWonPerGame:0.4,assistsPerGame:0.06,goalsPerGame:0.04,yellowCards:4},
    ],
    awayPlayers:[
      {name:"Matheus Cunha",position:"FW",shotsPerGame:2.1,sotPerGame:0.78,foulsCommittedPerGame:0.9,foulsWonPerGame:1.8,assistsPerGame:0.22,goalsPerGame:0.32,yellowCards:5},
      {name:"Joao Gomes",position:"MID",shotsPerGame:0.7,sotPerGame:0.25,foulsCommittedPerGame:2.1,foulsWonPerGame:0.6,assistsPerGame:0.14,goalsPerGame:0.06,yellowCards:9},
      {name:"Hwang Hee-Chan",position:"FW",shotsPerGame:1.8,sotPerGame:0.65,foulsCommittedPerGame:0.7,foulsWonPerGame:1.6,assistsPerGame:0.18,goalsPerGame:0.28,yellowCards:2},
      {name:"Pablo Sarabia",position:"MID",shotsPerGame:1.4,sotPerGame:0.5,foulsCommittedPerGame:0.8,foulsWonPerGame:1.4,assistsPerGame:0.28,goalsPerGame:0.18,yellowCards:3},
      {name:"Nelson Semedo",position:"DEF",shotsPerGame:0.5,sotPerGame:0.15,foulsCommittedPerGame:1.4,foulsWonPerGame:0.6,assistsPerGame:0.1,goalsPerGame:0.04,yellowCards:5},
    ],
    homeFirstHalfGoalsAvg:0.44,awayFirstHalfGoalsAvg:0.42,
    suggestedLegs:[
      {market:"Under 2.5 Goals",playerName:"",detail:"Both mid-table, nothing to play for. Combined xG only 2.20. Both first-half goal averages under 0.45. Flat game expected.",confidence:"HIGH",dataPoint:"Combined xG 2.20, both 0 motivation, R16 fires"},
      {market:"Player 1+ Fouls Committed",playerName:"Joao Gomes",detail:"Gomes commits 2.1 fouls/game — highest in our entire dataset. 9 yellow cards this season. Physical enforcer in a nothing game.",confidence:"HIGH",dataPoint:"Gomes 2.1 fouls committed/game, 9 yellow cards"},
      {market:"Player 1+ Fouls Committed",playerName:"Sander Berge",detail:"Berge 1.8 fouls/game. Burnley's physical midfielder. Both teams will be crunching into tackles in a dead rubber.",confidence:"MEDIUM",dataPoint:"Berge 1.8 fouls committed/game"},
      {market:"Total Match Fouls Over 22.5",playerName:"",detail:"Burnley 12.2 + Wolves 11.8 = 24.0 combined fouls avg. Physical match-up. Over 22.5 well backed by averages.",confidence:"HIGH",dataPoint:"Combined fouls avg 24.0/game"},
    ],
    intelligenceSummary:"Classic dead rubber final day game. Both sides safe with nothing to play for. Combined xG of just 2.20 is borderline for goals markets. R16 fires — mid-table final day games often produce flat, low-intensity football. Under 2.5 goals is the most logical market here. Wolves drew 1-1 with Fulham last week so have some momentum but no real purpose today.",
    biggestRisk:"Both teams decide to play attacking football as a farewell to the season and this ends 2-2 — an open game despite the lack of stakes.",
    dataConfidence:"MEDIUM",dataSource:"Sky Sports, ESPN, Squawka"
  },
  "Fulham-Newcastle": {
    home:"Fulham",away:"Newcastle",league:"Premier League",matchDate:"24 May 2026",kickoffTime:"4:00pm BST",venue:"Craven Cottage",
    context:"Final Day — European Chase",
    contextReason:"Newcastle chasing European qualification. Fulham mid-table safe. Newcastle have genuine motivation — European place at stake.",
    homeXg:"1.28",awayXg:"1.48",homeXgA:"1.42",awayXgA:"1.28",
    homeShots:"12.8",awayShots:"14.2",homeShotsOnTarget:"3.8",awayShotsOnTarget:"4.6",
    homeCornersAvg:"5.2",awayCornersAvg:"5.8",homeBTTSRate:"52",awayBTTSRate:"55",
    homeOver25Rate:"52",awayOver25Rate:"56",homeCardsAvg:"1.8",awayCardsAvg:"2.0",
    homeFoulsAvg:"11.2",awayFoulsAvg:"12.1",homeGoalsScored:"1.32",awayGoalsScored:"1.58",
    homeGoalsConceded:"1.42",awayGoalsConceded:"1.28",
    homeForm:["D","D","W","L","D"],awayForm:["W","W","L","W","W"],
    h2hLast5:"Newcastle W 2-1 Oct 2025 at St James. Wolves 1-1 Fulham last week",h2hBTTS:true,h2hOver25:true,
    referee:"Unknown",refereeCardsAvg:null,refereeFoulsAvg:null,refereeYellowsAvg:null,refereeRedsAvg:null,refereePenaltiesRate:null,refereeHomeAdvantage:null,refereeSeasonGames:null,
    predictedHomeXI:["Leno","Castagne","Andersen","Bassey","Robinson","Lukic","Berge","Iwobi","Pereira","Wilson","Jimenez"],
    predictedAwayXI:["Pope","Trippier","Botman","Thiaw","Burn","Joelinton","Guimaraes","Miley","Gordon","Woltemade","Murphy"],
    keyInjuries:["Various Fulham doubts"],
    keySuspensions:[],
    homePlayers:[
      {name:"Raul Jimenez",position:"FW",shotsPerGame:1.8,sotPerGame:0.68,foulsCommittedPerGame:0.9,foulsWonPerGame:1.8,assistsPerGame:0.14,goalsPerGame:0.28,yellowCards:3},
      {name:"Harry Wilson",position:"MID",shotsPerGame:1.4,sotPerGame:0.52,foulsCommittedPerGame:0.9,foulsWonPerGame:1.4,assistsPerGame:0.28,goalsPerGame:0.18,yellowCards:3},
      {name:"Alex Iwobi",position:"MID",shotsPerGame:1.2,sotPerGame:0.45,foulsCommittedPerGame:0.8,foulsWonPerGame:1.6,assistsPerGame:0.32,goalsPerGame:0.14,yellowCards:3},
      {name:"Sasa Lukic",position:"MID",shotsPerGame:0.7,sotPerGame:0.25,foulsCommittedPerGame:1.6,foulsWonPerGame:0.7,assistsPerGame:0.14,goalsPerGame:0.08,yellowCards:6},
      {name:"Calvin Bassey",position:"DEF",shotsPerGame:0.4,sotPerGame:0.12,foulsCommittedPerGame:1.4,foulsWonPerGame:0.4,assistsPerGame:0.06,goalsPerGame:0.04,yellowCards:5},
    ],
    awayPlayers:[
      {name:"Alexander Isak",position:"FW",shotsPerGame:3.1,sotPerGame:1.18,foulsCommittedPerGame:0.7,foulsWonPerGame:2.1,assistsPerGame:0.18,goalsPerGame:0.58,yellowCards:2},
      {name:"Jacob Murphy",position:"FW",shotsPerGame:1.8,sotPerGame:0.65,foulsCommittedPerGame:0.6,foulsWonPerGame:1.8,assistsPerGame:0.28,goalsPerGame:0.22,yellowCards:2},
      {name:"Anthony Gordon",position:"FW",shotsPerGame:2.2,sotPerGame:0.82,foulsCommittedPerGame:0.7,foulsWonPerGame:2.4,assistsPerGame:0.35,goalsPerGame:0.28,yellowCards:3},
      {name:"Bruno Guimaraes",position:"MID",shotsPerGame:1.2,sotPerGame:0.42,foulsCommittedPerGame:1.2,foulsWonPerGame:2.8,assistsPerGame:0.38,goalsPerGame:0.15,yellowCards:7},
      {name:"Joelinton",position:"MID",shotsPerGame:1.0,sotPerGame:0.35,foulsCommittedPerGame:1.8,foulsWonPerGame:1.2,assistsPerGame:0.18,goalsPerGame:0.12,yellowCards:6},
    ],
    homeFirstHalfGoalsAvg:0.55,awayFirstHalfGoalsAvg:0.6,
    suggestedLegs:[
      {market:"BTTS",playerName:"",detail:"Newcastle must win for European place. Fulham 52% home BTTS. Newcastle 55% away BTTS. H2H BTTS in majority of meetings.",confidence:"HIGH",dataPoint:"Newcastle motivated for Europe, 55% away BTTS"},
      {market:"Player 1+ Fouls Won",playerName:"Bruno Guimaraes",detail:"Guimaraes confirmed starting — wins 2.8 fouls/game, consistently one of PL highest. Dominant midfielder in a must-win game.",confidence:"HIGH",dataPoint:"Guimaraes confirmed starting, 2.8 fouls won/game"},
      {market:"Over 2.5 Goals",playerName:"",detail:"Newcastle need to win for European qualification. Fulham 1.32 goals/game at home. Newcastle 1.58 away. Open game expected.",confidence:"MEDIUM",dataPoint:"Newcastle 1.58 away goals/game, 56% Over 2.5"},
      {market:"Anytime Scorer",playerName:"Will Osula",detail:"Osula confirmed leading Newcastle attack. Newcastle must score to secure European place — Osula will be central to their attack.",confidence:"MEDIUM",dataPoint:"Osula confirmed starting, Newcastle must win"},
    ],
    intelligenceSummary:"Newcastle have genuine motivation — a win could secure European football. Fulham are safe and mid-table but are a strong home side. Newcastle won 2-1 at St James Park in October. Isak is Newcastle's key threat. The away motivation dynamic strongly favours goals and BTTS markets here. Fulham have quality going forward too — Jimenez and Wilson cause problems.",
    biggestRisk:"Fulham go ahead early and Newcastle struggle to break them down — a 1-0 to Fulham flatlines the game and BTTS fails.",
    dataConfidence:"MEDIUM",dataSource:"ESPN, Sky Sports, Opta"
  },
  "Liverpool-Brentford": {
    home:"Liverpool",away:"Brentford",league:"Premier League",matchDate:"24 May 2026",kickoffTime:"4:00pm BST",venue:"Anfield",
    context:"Final Day",
    contextReason:"Liverpool secure in 5th (Europa League confirmed). Brentford safe and mid-table. Opta gives Liverpool 52.6% win probability.",
    homeXg:"1.62",awayXg:"1.28",homeXgA:"1.28",awayXgA:"1.42",
    homeShots:"15.2",awayShots:"12.4",homeShotsOnTarget:"5.1",awayShotsOnTarget:"4.0",
    homeCornersAvg:"6.2",awayCornersAvg:"4.8",homeBTTSRate:"54",awayBTTSRate:"52",
    homeOver25Rate:"58",awayOver25Rate:"52",homeCardsAvg:"1.6",awayCardsAvg:"1.8",
    homeFoulsAvg:"10.2",awayFoulsAvg:"11.8",homeGoalsScored:"1.58",awayGoalsScored:"1.32",
    homeGoalsConceded:"1.28",awayGoalsConceded:"1.42",
    homeForm:["L","W","D","W","L"],awayForm:["W","D","L","W","D"],
    h2hLast5:"Liverpool strong at home historically — Brentford only promoted team last 3 years",h2hBTTS:true,h2hOver25:true,
    referee:"Unknown",refereeCardsAvg:null,refereeFoulsAvg:null,refereeYellowsAvg:null,refereeRedsAvg:null,refereePenaltiesRate:null,refereeHomeAdvantage:null,refereeSeasonGames:null,
    predictedHomeXI:["Kelleher","Alexander-Arnold","Konate","Van Dijk","Robertson","Gravenberch","Szoboszlai","Salah","Diaz","Nunez","Gakpo"],
    predictedAwayXI:["Flekken","Kayode","Collins","Mee","Ajer","Norgaard","Jensen","Mbeumo","Schade","Wissa","Toney"],
    keyInjuries:["Several Bournemouth doubts — note this is LIVERPOOL vs BRENTFORD"],
    keySuspensions:[],
    homePlayers:[
      {name:"Mohamed Salah",position:"FW",shotsPerGame:3.2,sotPerGame:1.28,foulsCommittedPerGame:0.5,foulsWonPerGame:2.2,assistsPerGame:0.48,goalsPerGame:0.55,yellowCards:1},
      {name:"Luis Diaz",position:"FW",shotsPerGame:2.4,sotPerGame:0.88,foulsCommittedPerGame:0.6,foulsWonPerGame:2.8,assistsPerGame:0.28,goalsPerGame:0.35,yellowCards:2},
      {name:"Darwin Nunez",position:"FW",shotsPerGame:2.8,sotPerGame:0.98,foulsCommittedPerGame:0.9,foulsWonPerGame:2.0,assistsPerGame:0.18,goalsPerGame:0.38,yellowCards:3},
      {name:"Ryan Gravenberch",position:"MID",shotsPerGame:0.9,sotPerGame:0.32,foulsCommittedPerGame:1.1,foulsWonPerGame:0.8,assistsPerGame:0.22,goalsPerGame:0.1,yellowCards:4},
      {name:"Alexis Mac Allister",position:"MID",shotsPerGame:1.2,sotPerGame:0.42,foulsCommittedPerGame:1.4,foulsWonPerGame:0.9,assistsPerGame:0.28,goalsPerGame:0.14,yellowCards:5},
    ],
    awayPlayers:[
      {name:"Bryan Mbeumo",position:"FW",shotsPerGame:2.26,sotPerGame:1.11,foulsCommittedPerGame:0.85,foulsWonPerGame:1.4,assistsPerGame:0.11,goalsPerGame:0.37,yellowCards:4},
      {name:"Ivan Toney",position:"FW",shotsPerGame:2.2,sotPerGame:0.82,foulsCommittedPerGame:1.2,foulsWonPerGame:2.2,assistsPerGame:0.15,goalsPerGame:0.35,yellowCards:4},
      {name:"Yoane Wissa",position:"FW",shotsPerGame:2.0,sotPerGame:0.72,foulsCommittedPerGame:0.7,foulsWonPerGame:2.0,assistsPerGame:0.18,goalsPerGame:0.32,yellowCards:2},
      {name:"Christian Norgaard",position:"MID",shotsPerGame:0.6,sotPerGame:0.22,foulsCommittedPerGame:1.6,foulsWonPerGame:0.7,assistsPerGame:0.14,goalsPerGame:0.08,yellowCards:6},
      {name:"Mikkel Damsgaard",position:"MID",shotsPerGame:1.1,sotPerGame:0.4,foulsCommittedPerGame:0.8,foulsWonPerGame:1.4,assistsPerGame:0.32,goalsPerGame:0.15,yellowCards:3},
    ],
    homeFirstHalfGoalsAvg:0.65,awayFirstHalfGoalsAvg:0.52,
    suggestedLegs:[
      {market:"Player 2+ Shots on Target",playerName:"Mohamed Salah",detail:"Salah confirmed starting — 1.28 SOT/game, 3.2 shots/game. Farewell Anfield appearance. Liverpool will create every chance for him.",confidence:"HIGH",dataPoint:"Salah confirmed starting, 1.28 SOT/game, farewell game"},
      {market:"Player 2+ Shots",playerName:"Mohamed Salah",detail:"Salah 3.2 shots/game avg. In emotional farewell game Liverpool will play through him relentlessly. No Diaz, no Nunez — Salah is the man.",confidence:"HIGH",dataPoint:"Salah 3.2 shots/game, farewell game, Liverpool will create for him"},
      {market:"Over 2.5 Goals",playerName:"",detail:"Liverpool 1.62 home goals/game, 58% Over 2.5 at home. Brentford 1.32 away goals/game with Ouattara, Thiago and Schade starting. Open game.",confidence:"HIGH",dataPoint:"Liverpool 58% Over 2.5 home, 1.62 goals/game"},
      {market:"BTTS",playerName:"",detail:"Brentford 52% away BTTS. Liverpool not always keeping clean sheets this season. Brentford need to win for European place — will attack.",confidence:"MEDIUM",dataPoint:"Brentford 52% away BTTS, need win for Europe"},
    ],
    intelligenceSummary:"Anfield farewell for Mohamed Salah who is leaving this summer — expect a huge emotional atmosphere. Liverpool 1.62 goals/game at home with 58% Over 2.5 rate. Brentford score freely too at 1.32/game. Both teams have quality attackers and neither is under massive pressure. The Salah farewell factor makes this a special occasion with Liverpool likely to go all out for a winning send-off.",
    biggestRisk:"Emotional occasion disrupts Liverpool's rhythm — they draw 1-1 and Over 2.5 fails.",
    dataConfidence:"MEDIUM",dataSource:"Squawka, Opta Analyst, Sky Sports"
  },
  "ManCity-AstonVilla": {
    home:"Manchester City",away:"Aston Villa",league:"Premier League",matchDate:"24 May 2026",kickoffTime:"4:00pm BST",venue:"Etihad Stadium",
    context:"Final Day — European Chase",
    contextReason:"Man City in 2nd — CL confirmed. Aston Villa chasing European qualification. Both have motivation. Guardiola's last game as City manager.",
    homeXg:"1.78",awayXg:"1.52",homeXgA:"1.18",awayXgA:"1.28",
    homeShots:"16.2",awayShots:"14.8",homeShotsOnTarget:"5.8",awayShotsOnTarget:"5.1",
    homeCornersAvg:"7.2",awayCornersAvg:"5.8",homeBTTSRate:"52",awayBTTSRate:"56",
    homeOver25Rate:"62",awayOver25Rate:"58",homeCardsAvg:"1.5",awayCardsAvg:"1.8",
    homeFoulsAvg:"10.2",awayFoulsAvg:"11.8",homeGoalsScored:"1.88",awayGoalsScored:"1.68",
    homeGoalsConceded:"1.18",awayGoalsConceded:"1.28",
    homeForm:["D","W","W","W","D"],awayForm:["W","W","D","W","L"],
    h2hLast5:"Man City dominated recent H2H — 3 wins from last 5",h2hBTTS:true,h2hOver25:true,
    referee:"Unknown",refereeCardsAvg:null,refereeFoulsAvg:null,refereeYellowsAvg:null,refereeRedsAvg:null,refereePenaltiesRate:null,refereeHomeAdvantage:null,refereeSeasonGames:null,
    predictedHomeXI:["Ederson","Walker","Ruben Dias","Akanji","Gvardiol","Rodri","De Bruyne","Bernardo","Foden","Doku","Haaland"],
    predictedAwayXI:["Martinez","Cash","Konsa","Torres","Digne","Tielemans","Kamara","McGinn","Bailey","Watkins","Rogers"],
    keyInjuries:["Pep Guardiola's last game — City players motivated for farewell send-off"],
    keySuspensions:[],
    homePlayers:[
      {name:"Erling Haaland",position:"FW",shotsPerGame:3.8,sotPerGame:1.62,foulsCommittedPerGame:0.5,foulsWonPerGame:2.2,assistsPerGame:0.12,goalsPerGame:0.68,yellowCards:1},
      {name:"Kevin De Bruyne",position:"MID",shotsPerGame:1.8,sotPerGame:0.62,foulsCommittedPerGame:0.6,foulsWonPerGame:1.0,assistsPerGame:0.52,goalsPerGame:0.18,yellowCards:3},
      {name:"Phil Foden",position:"AM",shotsPerGame:2.2,sotPerGame:0.82,foulsCommittedPerGame:0.5,foulsWonPerGame:1.8,assistsPerGame:0.32,goalsPerGame:0.3,yellowCards:2},
      {name:"Doku",position:"FW",shotsPerGame:2.0,sotPerGame:0.7,foulsCommittedPerGame:0.7,foulsWonPerGame:3.2,assistsPerGame:0.28,goalsPerGame:0.22,yellowCards:3},
      {name:"Bernardo Silva",position:"MID",shotsPerGame:1.4,sotPerGame:0.5,foulsCommittedPerGame:0.6,foulsWonPerGame:1.4,assistsPerGame:0.35,goalsPerGame:0.18,yellowCards:2},
    ],
    awayPlayers:[
      {name:"Ollie Watkins",position:"FW",shotsPerGame:2.6,sotPerGame:0.95,foulsCommittedPerGame:0.8,foulsWonPerGame:2.0,assistsPerGame:0.22,goalsPerGame:0.42,yellowCards:3},
      {name:"Morgan Rogers",position:"AM",shotsPerGame:2.0,sotPerGame:0.72,foulsCommittedPerGame:0.7,foulsWonPerGame:2.4,assistsPerGame:0.32,goalsPerGame:0.25,yellowCards:3},
      {name:"Leon Bailey",position:"FW",shotsPerGame:1.8,sotPerGame:0.65,foulsCommittedPerGame:0.6,foulsWonPerGame:2.8,assistsPerGame:0.3,goalsPerGame:0.22,yellowCards:2},
      {name:"Youri Tielemans",position:"MID",shotsPerGame:0.9,sotPerGame:0.32,foulsCommittedPerGame:1.4,foulsWonPerGame:0.8,assistsPerGame:0.22,goalsPerGame:0.12,yellowCards:5},
      {name:"Ezri Konsa",position:"DEF",shotsPerGame:0.4,sotPerGame:0.12,foulsCommittedPerGame:1.1,foulsWonPerGame:0.4,assistsPerGame:0.06,goalsPerGame:0.04,yellowCards:4},
    ],
    homeFirstHalfGoalsAvg:0.72,awayFirstHalfGoalsAvg:0.62,
    suggestedLegs:[
      {market:"Over 2.5 Goals",playerName:"",detail:"City 62% Over 2.5 at home. Villa 1.68 away goals/game. Both motivated. Guardiola farewell — Foden, Savinho, Semenyo all start.",confidence:"HIGH",dataPoint:"City 62% home Over 2.5, Villa 1.68 away goals/game"},
      {market:"BTTS",playerName:"",detail:"Villa 56% away BTTS with Watkins and Bailey confirmed. City missing Haaland but Foden and Savinho dangerous. H2H BTTS in majority.",confidence:"HIGH",dataPoint:"Villa 56% away BTTS, Watkins and Bailey confirmed"},
      {market:"Player 1+ Fouls Won",playerName:"Leon Bailey",detail:"Bailey confirmed starting for Villa — wins fouls constantly as direct winger running at defenders. One of Villa's most fouled players.",confidence:"HIGH",dataPoint:"Bailey confirmed starting, direct winger"},
      {market:"Anytime Scorer",playerName:"Ollie Watkins",detail:"Watkins confirmed starting for Villa — top scorer. Against a City side missing Haaland and rotating heavily, Villa will attack. Watkins their main threat.",confidence:"HIGH",dataPoint:"Watkins confirmed starting, Villa's main striker"},
    ],
    intelligenceSummary:"Pep Guardiola's final home game as Man City manager — a huge emotional occasion. City will want to send him off in style with a big performance. Villa have genuine motivation for European qualification. Combined xG of 3.30 is one of the strongest on the final day. Haaland will be desperate to score in Guardiola's farewell. This is one of the best Over 2.5 prospects on the card based on the data.",
    biggestRisk:"Occasion gets to City and they play below par — Villa use their tactical discipline to grind a draw. Guardiola situations can sometimes produce flat performances.",
    dataConfidence:"HIGH",dataSource:"Football Predictions, Squawka, Sky Sports, Opta"
  },
  "NottinghamForest-Bournemouth": {
    home:"Nottingham Forest",away:"Bournemouth",league:"Premier League",matchDate:"24 May 2026",kickoffTime:"4:00pm BST",venue:"City Ground",
    context:"Final Day — European Chase",
    contextReason:"Bournemouth chasing Conference League spot — 3pts behind 6th place Brighton. Need to win AND hope Brighton lose to Brighton vs Man Utd. Forest are safe and mid-table.",
    homeXg:"1.28",awayXg:"1.42",homeXgA:"1.48",awayXgA:"1.08",
    homeShots:"12.2",awayShots:"13.8",homeShotsOnTarget:"4.0",awayShotsOnTarget:"4.8",
    homeCornersAvg:"5.2",awayCornersAvg:"5.4",homeBTTSRate:"48",awayBTTSRate:"52",
    homeOver25Rate:"46",awayOver25Rate:"54",homeCardsAvg:"1.9",awayCardsAvg:"1.6",
    homeFoulsAvg:"12.1",awayFoulsAvg:"10.8",homeGoalsScored:"1.28",awayGoalsScored:"1.42",
    homeGoalsConceded:"1.48",awayGoalsConceded:"1.08",
    homeForm:["L","D","W","D","L"],awayForm:["D","D","W","D","D"],
    h2hLast5:"Bournemouth strong form — drew 17 games this season joint most ever in 38-game PL season",h2hBTTS:false,h2hOver25:false,
    referee:"Unknown",refereeCardsAvg:null,refereeFoulsAvg:null,refereeYellowsAvg:null,refereeRedsAvg:null,refereePenaltiesRate:null,refereeHomeAdvantage:null,refereeSeasonGames:null,
    predictedHomeXI:["Sels","Williams","Murillo","Milenkovic","Aina","Anderson","Yates","Hudson-Odoi","Gibbs-White","Elanga","Wood"],
    predictedAwayXI:["Flekken","Smith","Zabarnyi","Senesi","Kerkez","Cook","Christie","Semenyo","Evanilson","Kluivert","Brooks"],
    keyInjuries:["Iraola's final game as Bournemouth manager"],
    keySuspensions:[],
    homePlayers:[
      {name:"Chris Wood",position:"FW",shotsPerGame:2.4,sotPerGame:0.88,foulsCommittedPerGame:1.0,foulsWonPerGame:2.2,assistsPerGame:0.12,goalsPerGame:0.45,yellowCards:3},
      {name:"Anthony Elanga",position:"FW",shotsPerGame:2.0,sotPerGame:0.72,foulsCommittedPerGame:0.5,foulsWonPerGame:2.6,assistsPerGame:0.25,goalsPerGame:0.28,yellowCards:2},
      {name:"Morgan Gibbs-White",position:"AM",shotsPerGame:1.8,sotPerGame:0.65,foulsCommittedPerGame:0.8,foulsWonPerGame:1.8,assistsPerGame:0.38,goalsPerGame:0.22,yellowCards:5},
      {name:"Callum Hudson-Odoi",position:"FW",shotsPerGame:1.6,sotPerGame:0.58,foulsCommittedPerGame:0.6,foulsWonPerGame:2.0,assistsPerGame:0.28,goalsPerGame:0.2,yellowCards:2},
      {name:"Ryan Yates",position:"MID",shotsPerGame:0.6,sotPerGame:0.22,foulsCommittedPerGame:1.8,foulsWonPerGame:0.6,assistsPerGame:0.12,goalsPerGame:0.06,yellowCards:7},
    ],
    awayPlayers:[
      {name:"Antoine Semenyo",position:"FW",shotsPerGame:2.2,sotPerGame:0.82,foulsCommittedPerGame:0.6,foulsWonPerGame:2.6,assistsPerGame:0.22,goalsPerGame:0.32,yellowCards:2},
      {name:"Evanilson",position:"FW",shotsPerGame:2.0,sotPerGame:0.72,foulsCommittedPerGame:0.9,foulsWonPerGame:1.8,assistsPerGame:0.14,goalsPerGame:0.35,yellowCards:3},
      {name:"Justin Kluivert",position:"AM",shotsPerGame:1.8,sotPerGame:0.65,foulsCommittedPerGame:0.7,foulsWonPerGame:2.0,assistsPerGame:0.32,goalsPerGame:0.25,yellowCards:3},
      {name:"Ryan Christie",position:"MID",shotsPerGame:1.0,sotPerGame:0.38,foulsCommittedPerGame:1.2,foulsWonPerGame:1.0,assistsPerGame:0.25,goalsPerGame:0.12,yellowCards:4},
      {name:"Lewis Cook",position:"MID",shotsPerGame:0.5,sotPerGame:0.18,foulsCommittedPerGame:1.5,foulsWonPerGame:0.6,assistsPerGame:0.14,goalsPerGame:0.06,yellowCards:5},
    ],
    homeFirstHalfGoalsAvg:0.5,awayFirstHalfGoalsAvg:0.55,
    suggestedLegs:[
      {market:"BTTS",playerName:"",detail:"Forest 1.28 goals/game at home. Bournemouth need to win for Conference League — must attack. Evanilson confirmed leading their attack.",confidence:"MEDIUM",dataPoint:"Bournemouth need win, Forest 1.28 home goals"},
      {market:"Player 1+ Fouls Won",playerName:"Morgan Gibbs-White",detail:"Gibbs-White confirmed starting for Forest — creative AM who draws fouls driving at defenders. Forest's most dangerous player.",confidence:"HIGH",dataPoint:"Gibbs-White confirmed starting XI"},
      {market:"Anytime Scorer",playerName:"Evanilson",detail:"Evanilson confirmed leading Bournemouth attack — must score for European place. Motivated big game striker.",confidence:"MEDIUM",dataPoint:"Evanilson confirmed starting, Bournemouth need win"},
      {market:"Player 1+ Fouls Committed",playerName:"Ibrahim Sangare",detail:"Sangare confirmed starting for Forest — physical defensive midfielder who commits fouls breaking up play. Bournemouth will attack him.",confidence:"MEDIUM",dataPoint:"Sangare confirmed starting, physical midfielder"},
    ],
    intelligenceSummary:"Andoni Iraola's final game as Bournemouth manager — emotional send-off. Bournemouth need a win for Conference League but conceded just 5 away goals all of 2026 — best defensive away record in the PL this calendar year. Forest lost 3-2 to Man Utd last week so have some vulnerability. Bournemouth have drawn 17 games this season which shows their tendency toward tight results. Under 2.5 goals or a defensive draw would not be surprising here.",
    biggestRisk:"Bournemouth set up defensively despite needing to win — draw 0-0 or 1-1 and miss Europe. Their draw-heavy record suggests that's very possible.",
    dataConfidence:"MEDIUM",dataSource:"Sports Mole, Opta Analyst, Squawka, Football Predictions"
  },
  "Sunderland-Chelsea": {
    home:"Sunderland",away:"Chelsea",league:"Premier League",matchDate:"24 May 2026",kickoffTime:"4:00pm BST",venue:"Stadium of Light",
    context:"Final Day",
    contextReason:"Chelsea confirmed in top 4 (CL football). Sunderland safe. Both sides have nothing massive to play for beyond pride and final day positions.",
    homeXg:"1.18",awayXg:"1.58",homeXgA:"1.38",awayXgA:"1.18",
    homeShots:"11.2",awayShots:"15.2",homeShotsOnTarget:"3.6",awayShotsOnTarget:"5.2",
    homeCornersAvg:"4.8",awayCornersAvg:"6.2",homeBTTSRate:"51",awayBTTSRate:"54",
    homeOver25Rate:"48",awayOver25Rate:"58",homeCardsAvg:"1.9",awayCardsAvg:"1.7",
    homeFoulsAvg:"11.8",awayFoulsAvg:"10.2",homeGoalsScored:"1.22",awayGoalsScored:"1.62",
    homeGoalsConceded:"1.38",awayGoalsConceded:"1.18",
    homeForm:["W","D","W","L","W"],awayForm:["W","D","W","W","D"],
    h2hLast5:"Chelsea won 2-1 vs Spurs last week. Sunderland strong at home this season",h2hBTTS:true,h2hOver25:true,
    referee:"Unknown",refereeCardsAvg:null,refereeFoulsAvg:null,refereeYellowsAvg:null,refereeRedsAvg:null,refereePenaltiesRate:null,refereeHomeAdvantage:null,refereeSeasonGames:null,
    predictedHomeXI:["Roefs","Hume","Alderete","Ballard","Mukiele","Sadiki","Angulo","Le Fee","Diarra","Bi","Brobbey"],
    predictedAwayXI:["Sanchez","Reece James","Fofana","Chalobah","Cucurella","Caicedo","Fernandez","Madueke","Palmer","Nkunku","Jackson"],
    keyInjuries:["Various rotation expected for Chelsea"],
    keySuspensions:[],
    homePlayers:[
      {name:"Eliezer Brobbey",position:"FW",shotsPerGame:2.0,sotPerGame:0.72,foulsCommittedPerGame:1.1,foulsWonPerGame:2.4,assistsPerGame:0.14,goalsPerGame:0.32,yellowCards:3},
      {name:"Enzo Le Fee",position:"MID",shotsPerGame:1.4,sotPerGame:0.52,foulsCommittedPerGame:0.8,foulsWonPerGame:1.4,assistsPerGame:0.32,goalsPerGame:0.18,yellowCards:3},
      {name:"Romaine Mundle",position:"FW",shotsPerGame:1.8,sotPerGame:0.65,foulsCommittedPerGame:0.5,foulsWonPerGame:2.2,assistsPerGame:0.22,goalsPerGame:0.22,yellowCards:2},
      {name:"Pierre Ekwah",position:"MID",shotsPerGame:0.7,sotPerGame:0.25,foulsCommittedPerGame:1.6,foulsWonPerGame:0.8,assistsPerGame:0.16,goalsPerGame:0.08,yellowCards:5},
      {name:"Jenson Seelt",position:"DEF",shotsPerGame:0.3,sotPerGame:0.1,foulsCommittedPerGame:1.2,foulsWonPerGame:0.3,assistsPerGame:0.04,goalsPerGame:0.03,yellowCards:4},
    ],
    awayPlayers:[
      {name:"Cole Palmer",position:"AM",shotsPerGame:2.6,sotPerGame:0.98,foulsCommittedPerGame:0.5,foulsWonPerGame:1.8,assistsPerGame:0.45,goalsPerGame:0.4,yellowCards:2},
      {name:"Nicolas Jackson",position:"FW",shotsPerGame:2.2,sotPerGame:0.82,foulsCommittedPerGame:1.0,foulsWonPerGame:1.8,assistsPerGame:0.18,goalsPerGame:0.38,yellowCards:4},
      {name:"Noni Madueke",position:"FW",shotsPerGame:2.0,sotPerGame:0.72,foulsCommittedPerGame:0.6,foulsWonPerGame:2.2,assistsPerGame:0.25,goalsPerGame:0.28,yellowCards:2},
      {name:"Enzo Fernandez",position:"MID",shotsPerGame:0.9,sotPerGame:0.32,foulsCommittedPerGame:1.3,foulsWonPerGame:0.9,assistsPerGame:0.28,goalsPerGame:0.1,yellowCards:5},
      {name:"Moises Caicedo",position:"MID",shotsPerGame:0.6,sotPerGame:0.22,foulsCommittedPerGame:1.8,foulsWonPerGame:0.7,assistsPerGame:0.14,goalsPerGame:0.06,yellowCards:7},
    ],
    homeFirstHalfGoalsAvg:0.52,awayFirstHalfGoalsAvg:0.6,
    suggestedLegs:[
      {market:"Over 2.5 Goals",playerName:"",detail:"Chelsea 1.62 away goals/game, 58% Over 2.5 away. Sunderland scored 3 last week. Both chasing European places — maximum motivation.",confidence:"HIGH",dataPoint:"Chelsea 58% Over 2.5 away, 1.62 goals/game"},
      {market:"BTTS",playerName:"",detail:"Chelsea 54% away BTTS. Sunderland 51% home BTTS. Both sides pushing for Europe — attack-minded. Palmer, Neto and Pedro all confirmed.",confidence:"HIGH",dataPoint:"Chelsea 54% away BTTS, Sunderland 51% home"},
      {market:"Player 2+ Shots on Target",playerName:"Cole Palmer",detail:"Palmer confirmed starting — 0.98 SOT/game, 2.6 shots/game. Chelsea's main creator in a must-win game for European qualification.",confidence:"HIGH",dataPoint:"Palmer confirmed starting, 0.98 SOT/game"},
      {market:"Player 1+ Fouls Won",playerName:"Brian Brobbey",detail:"Brobbey CONFIRMED STARTING for Sunderland — 2.4 fouls won/game. Physical striker who draws contact. Sunderland's European dream rests on him.",confidence:"HIGH",dataPoint:"Brobbey confirmed starting, 2.4 fouls won/game"},
    ],
    intelligenceSummary:"Chelsea are CL confirmed and will be motivated to finish the season well. Sunderland have been strong at home all season with a passionate 47k crowd behind them. Chelsea scored in 7 of last 8 away games. Sunderland beat Everton 3-1 last week with goals flowing. Combined attack quality strongly supports BTTS and Over 2.5 markets. This is one of the more straightforward double-chance markets on the final day card.",
    biggestRisk:"Chelsea rotate heavily with nothing to play for and put out a weakened side — Sunderland dominate but can't score past Sanchez.",
    dataConfidence:"MEDIUM",dataSource:"Opta, Sky Sports, ESPN"
  }
};

// CONFIRMED LINEUPS — All 10 PL Final Day fixtures 24 May 2026
// Source: 101greatgoals.com official club Twitter feeds — verified 24 May 2026
const CONFIRMED_LINEUPS = {
  "WestHam-Leeds": {
    lineupConfirmed: true,
    homeFormation: "4-2-3-1", awayFormation: "3-5-2",
    homeXI: ["Hermansen","Walker-Peters","Disasi","Mavropanos","Diouf","Soucek","Fernandes","Summerville","Bowen","Pablo","Taty"],
    awayXI: ["Darlow","Bogle","Justin","Rodon","Struijk","Bijol","Ampadu","Tanaka","Aaronson","Nmecha","Calvert-Lewin"],
    homeSubs: ["Areola","Wan-Bissaka","Scarles","Potts","Kante","Magassa","Wilson","Piroe","Lamadrid","Gnonto"],
    awaySubs: ["Perri","Byram","Bornauw","Cresswell","Buonanotte","Chadwick","James","Gnonto"],
    keyStarting: ["Summerville confirmed starting for West Ham","Bowen captain","Soucek starts","Ampadu starts","Calvert-Lewin leads Leeds","Pablo and Taty up front together for West Ham"],
    keyAbsent: ["Traore QUES","Gudmundsson OUT","Stach OUT","Gruev OUT","Okafor OUT"],
    legAlerts: ["✅ Summerville confirmed starting — backs fouls won market (2.8/game)","✅ Soucek confirmed — backs fouls committed market","✅ Ampadu confirmed — backs fouls committed (1.9/game) under Taylor","✅ Bowen confirmed captain — backs shots market","✅ Calvert-Lewin confirmed leading Leeds attack"]
  },
  "Tottenham-Everton": {
    lineupConfirmed: true,
    homeFormation: "4-2-3-1", awayFormation: "4-2-3-1",
    homeXI: ["Kinsky","Spence","Danso","Van de Ven","Udogie","Bentancur","Palhinha","Porro","Gallagher","Tel","Iroegbunam"],
    awayXI: ["Pickford","Mykolenko","Keane","Tarkowski","O'Brien","Iroegbunam","Garner","Ndiaye","Dewsbury-Hall","Rohl","Beto"],
    homeSubs: ["Vicario","Dragusin","Gray","Maddison","Alcaraz","Armstrong","Bergvall","Coleman","Sarr","Bissouma","Solanke","Dibling","Kolo Muani","George"],
    awaySubs: ["Travers","Azmou","Alcaraz","Armstrong","Coleman","Beto","McNeil","Dibling","George"],
    keyStarting: ["Kinsky starts NOT Vicario","Spence at right back","Porro in midfield","Bentancur confirmed — 1.4 fouls/game","Beto confirmed for Everton — 2.1 fouls won/game","Oliver refereeing — 4.1 cards/game"],
    keyAbsent: ["Vicario on bench","Romero OUT","Kulusevski OUT","Odobert OUT","Simons OUT","Branthwaite OUT","Grealish OUT"],
    legAlerts: ["✅ Bentancur confirmed — backs fouls committed leg (1.4/game) under Oliver","✅ Beto confirmed — backs fouls won leg (2.1/game)","⚠️ Porro in midfield not right back — cards risk lower but still 10 PL yellows"]
  },
  "Brighton-ManUnited": {
    lineupConfirmed: true,
    homeFormation: "4-2-3-1", awayFormation: "4-2-3-1",
    homeXI: ["Verbruggen","De Cuyper","Van Hecke","Dunk","Kadioglu","Baleba","Gross","Minteh","Hinshelwood","Diego Gomez","Welbeck"],
    awayXI: ["Lammens","Shaw","Maguire","Martinez","Mazraoui","Mount","Mainoo","Cunha","Fernandes","Mbeumo","Zirkzee"],
    homeSubs: ["Steele","Wieffer","Webster","Barco","Offiah"],
    awaySubs: ["Heaton","Dalot","Amad","Antony","Rashford"],
    keyStarting: ["Welbeck leads Brighton attack","Minteh confirmed starting","Mbeumo confirmed — 1.11 SOT/game","Baleba starts — 1.8 fouls committed"],
    keyAbsent: ["Casemiro OUT","De Ligt OUT","Sesko OUT","Mitoma OUT"],
    legAlerts: ["✅ Mbeumo confirmed — BACK 2+ SOT (1.11/game)","✅ Minteh confirmed STARTING — backs fouls won market (2.8/game)","✅ Welbeck confirmed — backs shots/scorer markets","✅ Baleba confirmed — backs fouls committed leg"]
  },
  "CrystalPalace-Arsenal": {
    lineupConfirmed: true,
    homeFormation: "3-4-2-1", awayFormation: "4-2-3-1",
    homeXI: ["Henderson","Riad","Cardines","Munoz","Clyne","Devenny","Hughes","Kamada","Lerma","Sarr","Strand Larsen"],
    awayXI: ["Arrizabalaga","Mosquera","Norgaard","Hincapie","Calafiori","Lewis-Skelly","Zubimendi","Dowman","Madueke","Martinelli","Jesus"],
    homeSubs: ["Benitez","Lacroix","Sosa","Mitchell","Wharton","Pino","Johnson","Guessand","Mateta"],
    awaySubs: ["Raya","Saliba","Gabriel","Calafiori","Rice","Saka","Havertz","Trossard","Nwaneri"],
    keyStarting: ["Johnson and Pino BOTH on bench for Palace","Lerma confirmed — 2.0 fouls committed/game","Sarr starts as AM for Palace","Kamada in midfield","Strand Larsen leads Palace attack","Arrizabalaga in goal not Raya","Jesus leads Arsenal","Saka and Rice both rested on bench","Martinelli starts on left for Arsenal","Madueke starts on right","Dowman makes Premier League start","Norgaard starts in defence"],
    keyAbsent: ["Johnson on BENCH","Pino on BENCH","Saka RESTED — bench","Rice RESTED — bench","Raya RESTED — bench","Havertz RESTED — bench","Doucoure OUT","Richards OUT","Nketiah OUT"],
    legAlerts: ["❌ Johnson on BENCH — remove Johnson legs","❌ Pino on BENCH — remove Pino legs","⚠️ Saka RESTED — bench for CL final vs PSG","✅ Lerma confirmed — backs fouls committed (2.0/game)","✅ Jesus confirmed — backs shots/scorer markets","✅ Martinelli confirmed — backs shots/fouls won markets"]
  },
  "Burnley-Wolves": {
    lineupConfirmed: true,
    homeFormation: "4-2-3-1", awayFormation: "4-2-3-1",
    homeXI: ["Weiss","Pires","Tuanzebe","Esteve","K. Walker","Florentino","Ugochukwu","Anthony","Hannibal","Tchaouna","Flemming"],
    awayXI: ["Sa","Moller Wolfe","Krejci","Bueno","Mosquera","Joao Gomes","Andre","Hwang","Mane","R. Gomes","Armstrong"],
    homeSubs: ["Roberts","O'Shea","Brownhill","Barnes","Rodriguez"],
    awaySubs: ["Johnstone","Semedo","Dawson","Sarabia","Cunha"],
    keyStarting: ["Joao Gomes confirmed — 2.1 fouls/game 9 yellows","Hwang starts for Wolves","Flemming leads Burnley attack"],
    keyAbsent: ["Cullen OUT","Beyer OUT","Chiwome OUT"],
    legAlerts: ["✅ Joao Gomes confirmed — BACK fouls committed and cards markets","✅ Total fouls Over 22.5 backed by combined averages","✅ Under 2.5 goals backed — dead rubber final day"]
  },
  "Fulham-Newcastle": {
    lineupConfirmed: true,
    homeFormation: "4-2-3-1", awayFormation: "4-2-3-1",
    homeXI: ["Leno","Castagne","Diop","Bassey","Robinson","Berge","Iwobi","Robb","Smith Rowe","Kevin","Jimenez"],
    awayXI: ["Pope","Hall","Botman","Thiaw","Trippier","Guimaraes","Willock","Ramsey","Woltemade","Barnes","Osula"],
    homeSubs: ["Lecomte","Cuenca","Tete","Sessegnon","Reed","King","Cairney","Wilson","Wissa"],
    awaySubs: ["Ramsdale","Murphy","Burn","Elanga","Gordon","Isak","Neave"],
    keyStarting: ["Guimaraes confirmed — 2.8 fouls won/game","Trippier starts at right back","Osula leads Newcastle","Isak on BENCH — NOT starting","Barnes starts on right"],
    keyAbsent: ["Isak on BENCH — moved to Liverpool but on loan back","Joelinton OUT","Krafth OUT","Livramento OUT","Miley OUT","Schar OUT","Andersen SUS — Fulham"],
    legAlerts: ["✅ Guimaraes confirmed — BACK fouls won (2.8/game)","✅ Trippier confirmed — backs corners/assists markets","⚠️ Isak on BENCH — back Osula as scorer not Isak","⚠️ Joelinton OUT — remove from any prop legs"]
  },
  "Liverpool-Brentford": {
    lineupConfirmed: true,
    homeFormation: "4-3-3", awayFormation: "4-2-3-1",
    homeXI: ["Alisson","Jones","Van Dijk","Konate","Robertson","Gravenberch","Szoboszlai","Mac Allister","Salah","Gakpo","Ngumoha"],
    awayXI: ["Kelleher","Kayode","Van den Berg","Collins","Lewis-Potter","Janelt","Henderson","Jensen","Ouattara","Thiago","Schade"],
    homeSubs: ["Mamardashvili","Frimpong","Gomez","Kerkez","Nyoni","Endo","Isak","Chiesa","Nelson","Wirtz","Donovan"],
    awaySubs: ["Valdimarsson","Hickey","Ajer","Pinnock","Nyoni","Damsgaard","Dasilva","Furo","Nelson","Donovan"],
    keyStarting: ["Salah confirmed starting — farewell Anfield","Robertson confirmed — farewell game","Gakpo leads the line","Ngumoha starts — young forward","Szoboszlai in midfield","Wirtz on BENCH","Isak on bench for Liverpool (not Newcastle)","Henderson starts for Brentford vs former club"],
    keyAbsent: ["Wirtz on BENCH","Bradley OUT","Ekitike OUT","Carvalho OUT — Brentford"],
    legAlerts: ["✅ Salah confirmed — STRONGLY BACK shots and SOT markets (farewell game)","✅ Gakpo confirmed leading the line","⚠️ Wirtz on BENCH — remove all Wirtz prop legs","⚠️ Diaz NO LONGER at Liverpool (moved to Bayern Munich)","⚠️ Nunez NO LONGER at Liverpool (moved to Atletico)"]
  },
  "ManCity-AstonVilla": {
    lineupConfirmed: true,
    homeFormation: "4-2-3-1", awayFormation: "4-3-3",
    homeXI: ["Trafford","Lewis","Stones","Dias","Ake","Nico O'Reilly","Bernardo","Reijnders","Foden","Savinho","Semenyo"],
    awayXI: ["Bizot","Lindelof","Mings","Barkley","Buendia","Watkins","Garcia","Luiz","Maatsen","Bogarde","Bailey"],
    homeSubs: ["Bettinelli","Gvardiol","Nunes","Alleyne","Ait Nouri","Kovacic","Cherki","Doku","Marmoush"],
    awaySubs: ["Wright","Digne","Cash","Torres","Onana","Hemmings","Tielemans","Rogers","McGinn"],
    keyStarting: ["Trafford in goal NOT Donnarumma","Haaland NOT in squad at all","Foden confirmed starting","Savinho starts on right","Semenyo on left","Reijnders starts","Watkins confirmed starting for Villa","Bailey starts","Luiz starts for Villa"],
    keyAbsent: ["Haaland NOT in squad","Doku on BENCH","Cherki on BENCH","De Bruyne at Napoli","Kamara OUT","Emi Martinez QUES — Bizot starts"],
    legAlerts: ["❌ HAALAND NOT IN SQUAD — remove all Haaland legs immediately","❌ Doku on BENCH — remove fouls won leg","✅ Watkins confirmed starting for Villa — backs scorer/shots markets","✅ Foden confirmed — backs shots market","✅ Bailey confirmed — backs fouls won market for Villa"]
  },
  "NottinghamForest-Bournemouth": {
    lineupConfirmed: true,
    homeFormation: "4-4-2", awayFormation: "4-2-3-1",
    homeXI: ["Sels","Milenkovic","Cunha","Moreto","Williams","Hutchinson","Anderson","Sangare","Gibbs-White","Scott","Adams"],
    awayXI: ["Petrovic","Truffert","Senesi","Hill","Smith","Scott","Adams","Tavernier","Kroupi","Rayan","Evanilson"],
    homeSubs: ["Ortega","Abbott","Diakite","McAtee","Toth","Netz","Kluivert","Dominguez","Cook","Yates","Adli","Ndoye","Gannon-Doak","Sillah","Brooks","Avoniyi","Unal"],
    awaySubs: ["Mandas","Diakite","McAtee","Toth","Netz","Kluivert","Cook","Yates","Ndoye","Gannon-Doak","Brooks","Avoniyi","Unal"],
    keyStarting: ["Sels in goal","Gibbs-White confirmed — creative hub","Adams and Scott both start","Evanilson leads Bournemouth","Hudson-Odoi OUT","Christie SUSPENDED","Wood NOT in XI","Elanga NOT in XI"],
    keyAbsent: ["Hudson-Odoi OUT","Murillo OUT","Savona OUT","Christie SUS","Jimenez SUS","Wood not in XI","Elanga not in XI","Aina QUES","Soler QUES"],
    legAlerts: ["✅ Gibbs-White confirmed — backs fouls won/shots markets","✅ Evanilson confirmed — backs scorer/shots markets","⚠️ Wood NOT in XI — remove Wood legs","⚠️ Elanga NOT in XI — remove Elanga legs","⚠️ Hudson-Odoi OUT","⚠️ Christie SUSPENDED — remove cards legs for Christie"]
  },
  "Sunderland-Chelsea": {
    lineupConfirmed: true,
    homeFormation: "4-2-3-1", awayFormation: "3-4-3",
    homeXI: ["Roefs","Geertruida","Mukiele","O'Nien","Reinildo","Hume","Xhaka","Sadiki","Angulo","Le Fee","Brobbey"],
    awayXI: ["Sanchez","Gusto","Fofana","Colwill","Hato","Cucurella","Caicedo","Enzo","Palmer","Neto","Pedro"],
    homeSubs: ["Ellborg","Cirkin","Alderete","James","Diarra","Traore","Santos","Rigg","Essugo","Mayenda","Gamacho","Bi","Derry","Isidor","Delap"],
    awaySubs: ["Jorgensen","Acheampong","Chalobah","Diarra","Santos","Essugo","Gamacho","Derry","Delap"],
    keyStarting: ["Brobbey CONFIRMED STARTING for Sunderland","Palmer confirmed — 2.6 shots 0.98 SOT/game","Caicedo confirmed — 1.8 fouls committed/game","Xhaka starts for Sunderland","Gusto at right back for Chelsea","Neto starts on right for Chelsea","Pedro leads Chelsea attack"],
    keyAbsent: ["Mudryk SUS","Ballard SUS — Sunderland","Estevao OUT","Gittens QUES","Lavia QUES"],
    legAlerts: ["✅ Brobbey CONFIRMED STARTING — backs fouls won market (2.4/game)","✅ Palmer confirmed — BACK shots and SOT markets (2.6 shots 0.98 SOT/game)","✅ Caicedo confirmed — backs fouls committed (1.8/game)","✅ Pedro Neto confirmed — backs fouls won/shots markets","⚠️ Mudryk SUSPENDED — remove any Mudryk legs"]
  }
};

// Common team name aliases for flexible matching
const TEAM_ALIASES = {
  "man utd":"manchester united","man united":"manchester united","united":"manchester united",
  "man city":"manchester city","city":"manchester city",
  "spurs":"tottenham","tottenham hotspur":"tottenham",
  "wolves":"wolverhampton","wolverhampton wanderers":"wolves",
  "west ham united":"west ham",
  "leeds":"leeds united",
  "newcastle united":"newcastle","newcastle utd":"newcastle",
  "aston villa":"villa","avfc":"aston villa",
  "forest":"nottingham forest","nffc":"nottingham forest","notts forest":"nottingham forest",
  "palace":"crystal palace","cpfc":"crystal palace",
  "brighton & hove albion":"brighton","brighton hove albion":"brighton","bhafc":"brighton",
  "brentford fc":"brentford",
  "chelsea fc":"chelsea",
  "arsenal fc":"arsenal",
  "liverpool fc":"liverpool",
  "everton fc":"everton",
  "fulham fc":"fulham",
  "sunderland afc":"sunderland",
  "bournemouth":"bournemouth","afc bournemouth":"bournemouth",
  "burnley fc":"burnley",
};

function normalise(name) {
  const l = name.toLowerCase().trim();
  return TEAM_ALIASES[l] || l;
}

function getPreloadedData(home, away) {
  const homeN = normalise(home);
  const awayN = normalise(away);
  for(const [key, v] of Object.entries(PRELOADED_DATA)) {
    const vhN = normalise(v.home);
    const vaN = normalise(v.away);
    if(vhN===homeN && vaN===awayN) {
      return { ...v, confirmedLineupData: CONFIRMED_LINEUPS[key] || null };
    }
    const homeMatch = vhN.split(" ")[0]===homeN.split(" ")[0] || homeN.includes(vhN.split(" ")[0]) || vhN.includes(homeN.split(" ")[0]);
    const awayMatch = vaN.split(" ")[0]===awayN.split(" ")[0] || awayN.includes(vaN.split(" ")[0]) || vaN.includes(awayN.split(" ")[0]);
    if(homeMatch && awayMatch) {
      return { ...v, confirmedLineupData: CONFIRMED_LINEUPS[key] || null };
    }
  }
  return null;
}

async function callClaude(prompt, webSearch=false) {
  const body = { model:"claude-sonnet-4-20250514", max_tokens:1500, messages:[{role:"user",content:prompt}] };
  const res = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const data = await res.json();
  const texts = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n");
  if(!texts) throw new Error("No text content returned");
  return texts;
}

function parseJSON(raw) {
  // Strip markdown code fences
  let clean = raw.replace(/```json\s*/gi,"").replace(/```\s*/g,"").trim();
  // Try direct parse first
  try { return JSON.parse(clean); } catch {}
  // Find outermost { } block — handle nested braces properly
  let depth=0, start=-1, end=-1;
  for(let i=0;i<clean.length;i++){
    if(clean[i]==="{"){if(depth===0)start=i;depth++;}
    else if(clean[i]==="}"){depth--;if(depth===0){end=i;break;}}
  }
  if(start===-1||end===-1) throw new Error("No JSON object found");
  const candidate=clean.substring(start,end+1);
  // Fix common issues: trailing commas before } or ]
  const fixed=candidate
    .replace(/,(\s*[}\]])/g,"$1")
    .replace(/:\s*undefined/g,":null")
    .replace(/:\s*NaN/g,":null");
  return JSON.parse(fixed);
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────
export default function TheBABLabFINAL() {
  const [tab, setTab] = useState("finalday");
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [stageType, setStageType] = useState(""); // "research"|"matchday"|"postmatch"
  const [stageIdx, setStageIdx] = useState(-1);
  const [stageLabel, setStageLabel] = useState("");
  const [fetchError, setFetchError] = useState("");
  const [rd, setRd] = useState(null); // research data
  const [md, setMd] = useState(null); // matchday data
  const [legs, setLegs] = useState([{market:"BTTS",playerName:"",detail:""}]);
  const [result, setResult] = useState(null);
  const [analysing, setAnalysing] = useState(false);
  const [babs, setBabs] = useState([]);
  const [stats, setStats] = useState(initStats());
  const [patterns, setPatterns] = useState([]);
  const [resultInput, setResultInput] = useState({});
  const [postMatchData, setPostMatchData] = useState(null);
  const [selectedPostBab, setSelectedPostBab] = useState(null);
  const [odds, setOdds] = useState("");
  const [stake, setStake] = useState("");
  const [copied, setCopied] = useState(false);
  const [postText, setPostText] = useState("");
  const resultRef = useRef(null);

  useEffect(()=>{
    (async()=>{
      const [b,s,p]=await Promise.all([retrieve(KEYS.babs,[]),retrieve(KEYS.stats,initStats()),retrieve(KEYS.patterns,[])]);
      setBabs(b);setStats(s);setPatterns(p);
    })();
  },[]);

  const isFetching = stageType !== "";

  const runStages = (stages, type, onDone) => {
    setStageType(type); setStageIdx(0); setStageLabel(stages[0]);
    let i=0;
    const iv=setInterval(()=>{
      i++;
      if(i<stages.length){setStageIdx(i);setStageLabel(stages[i]);}
      else{clearInterval(iv);if(onDone)onDone();}
    },1700);
    return iv;
  };

  const finishFetch = () => { setStageType(""); setStageIdx(-1); setStageLabel(""); };

  // ── QUICK SELECT FIXTURE ───────────────────────────────────────────────
  const quickSelect = (fix) => {
    setHomeTeam(fix.home); setAwayTeam(fix.away);
    setRd(null); setMd(null); setResult(null); setFetchError("");
    setTab("analyse");
    setTimeout(()=>window.scrollTo({top:0,behavior:"smooth"}),100);
  };

  // ── STAGE 1: RESEARCH ─────────────────────────────────────────────────
  const runResearch = async () => {
    if(!homeTeam.trim()||!awayTeam.trim()) return;
    setFetchError("");setRd(null);setMd(null);setResult(null);

    // Check preloaded data first — instant load, no API call needed
    const preloaded = getPreloadedData(homeTeam.trim(), awayTeam.trim());
    if(preloaded) {
      setRd(preloaded);
      // Auto-load confirmed lineups if available
      if(preloaded.confirmedLineupData) {
        setMd(preloaded.confirmedLineupData);
      }
      if(preloaded.suggestedLegs?.length>0) {
        // Cap at 4 legs — take highest confidence first (HIGH > MEDIUM > LOW)
        const ranked = [...preloaded.suggestedLegs].sort((a,b) => {
          const order = {HIGH:0, MEDIUM:1, LOW:2};
          return (order[a.confidence]||1) - (order[b.confidence]||1);
        }).slice(0,4);
        setLegs(ranked.map(l=>({market:l.market||"BTTS",playerName:l.playerName||"",detail:l.detail||"",confidence:l.confidence,dataPoint:l.dataPoint})));
      }
      setFetchError("");
      return;
    }

    // Not a preloaded fixture — let user know which teams are available today
    const available = Object.values(PRELOADED_DATA).map(v=>`${v.home} vs ${v.away}`).join(", ");
    setFetchError(`No preloaded data for "${homeTeam} vs ${awayTeam}". Today's available fixtures: ${available}`);
    return; // Don't attempt API call for now — avoids the web search error

    const iv = runStages(RESEARCH_STAGES,"research",null);
    const prompt=`You are a football data analyst. Research: ${homeTeam} vs ${awayTeam}. Return ONLY valid JSON, no markdown, no explanation before or after:

{
  "home":"${homeTeam}","away":"${awayTeam}","league":"league name","matchDate":"date or null","kickoffTime":"time or null","venue":"stadium",
  "context":"one of: Standard League Match, Relegation Battle, Title Race, Promotion Chase, European Chase, Derby / Rivalry, Nothing to Play For, Final Day, Final Day — Relegation Decider, Final Day — European Chase, Play-Off Final / Wembley Final, Cup Final / One-Off Game, Dead Rubber",
  "contextReason":"one sentence why",
  "homeXg":"number string e.g. 1.42","awayXg":"number string","homeXgA":"number string","awayXgA":"number string",
  "homeShots":"number","awayShots":"number","homeShotsOnTarget":"number","awayShotsOnTarget":"number",
  "homeCornersAvg":"number","awayCornersAvg":"number",
  "homeBTTSRate":"percent number e.g. 58","awayBTTSRate":"percent number",
  "homeOver25Rate":"percent number","awayOver25Rate":"percent number",
  "homeCardsAvg":"number","awayCardsAvg":"number","homeFoulsAvg":"number","awayFoulsAvg":"number",
  "homeGoalsScored":"number","awayGoalsScored":"number","homeGoalsConceded":"number","awayGoalsConceded":"number",
  "homeForm":["W","W","D","L","W"],"awayForm":["L","W","D","W","L"],
  "h2hLast5":"brief summary","h2hBTTS":true,"h2hOver25":false,
  "referee":"name or null","refereeCardsAvg":"number or null","refereeFoulsAvg":"number or null",
  "refereeYellowsAvg":"number or null","refereeRedsAvg":"number or null","refereePenaltiesRate":"number or null",
  "refereeHomeAdvantage":"note or null","refereeSeasonGames":"number or null",
  "predictedHomeXI":["player1",...11 players],"predictedAwayXI":["player1",...11 players],
  "keyInjuries":["player — team — injury"],"keySuspensions":["player — team — reason"],
  "suggestedLegs":[{"market":"market name","playerName":"or empty","detail":"data-backed reason","confidence":"HIGH/MEDIUM/LOW","dataPoint":"specific stat"}],
  "intelligenceSummary":"4-5 sentence analytical summary for BAB building",
  "finalScore":"West Ham 3-0 Leeds",""finalScore":"Tottenham 1-0 Everton",""finalScore":"Brighton 0-3 Man Utd",""finalScore":"Liverpool 1-1 Brentford",""finalScore":"Nottm Forest 1-1 Bournemouth",""finalScore":"Man City 3-2 Aston Villa",""finalScore":"Sunderland 1-2 Chelsea",""finalScore":"Crystal Palace 1-2 Arsenal",""biggestRisk":"single biggest BAB risk in one sentence",
  "dataConfidence":"HIGH/MEDIUM/LOW","dataSource":"brief source note"
}

Provide 4-6 suggested legs backed by data. Final day note: Arsenal are PL champions. Spurs and West Ham in relegation battle. Use null for any unknown field. CRITICAL: Return ONLY the JSON object. No explanation before or after. No markdown fences.`;

    try {
      const raw=await callClaude(prompt,true);
      let parsed;
      try { parsed=parseJSON(raw); }
      catch(jsonErr){
        clearInterval(iv);finishFetch();
        setFetchError("Data received but JSON parse failed. Try again — the AI may have returned an unusual format.");
        return;
      }
      clearInterval(iv);finishFetch();
      setRd(parsed);
      if(parsed.suggestedLegs?.length>0) setLegs(parsed.suggestedLegs.map(l=>({market:l.market||"BTTS",playerName:l.playerName||"",detail:l.detail||"",confidence:l.confidence,dataPoint:l.dataPoint})));
    } catch(e){ clearInterval(iv);finishFetch();setFetchError("Fetch failed: "+e.message+". Check connection and try again."); }
  };

  // ── STAGE 2: MATCHDAY ─────────────────────────────────────────────────
  const runMatchday = async () => {
    if(!rd) return;
    const iv=runStages(MATCHDAY_STAGES,"matchday",null);
    const prompt=`Match: ${rd.home} vs ${rd.away}, ${rd.league}. Lineups are now being announced (75 mins before kickoff). Search the web RIGHT NOW for confirmed starting XIs, late news, confirmed referee. Return ONLY valid JSON:

{
  "homeXI":["player1",...11],"awayXI":["player1",...11],
  "homeSubs":["sub1",...5],"awaySubs":["sub1",...5],
  "homeFormation":"e.g. 4-3-3","awayFormation":"e.g. 4-2-3-1",
  "confirmedReferee":"name","lateNews":["news item"],
  "lineupConfirmed":true,
  "keyStarting":["notable players starting that affect BABs"],
  "keyAbsent":["notable absences affecting BABs"],
  "legAlerts":["specific alerts about suggested legs e.g. Welbeck not in squad — drop SOT leg"]
}`;
    try {
      const raw=await callClaude(prompt,true);
      const parsed=parseJSON(raw);
      clearInterval(iv);finishFetch();setMd(parsed);
    } catch(e){ clearInterval(iv);finishFetch();setMd({lineupConfirmed:false,lateNews:[],legAlerts:["Could not fetch lineups — check BBC Sport or Sky Sports manually."]}); }
  };

  // ── ANALYSE ───────────────────────────────────────────────────────────
  const analyse = async () => {
    if(!rd) return;
    setAnalysing(true);setResult(null);
    const match={home:rd.home,away:rd.away,league:rd.league,context:rd.context,homeXg:rd.homeXg,awayXg:rd.awayXg,homeShots:rd.homeShots,awayShots:rd.awayShots,referee:rd.referee||md?.confirmedReferee};
    const confirmed=md?.lineupConfirmed?md:null;
    const legAnalysis=legs.map(leg=>({...leg,...runRules(leg,match,rd,stats,confirmed,patterns)}));
    const hardAvoids=legAnalysis.filter(l=>l.score<25).length;
    const avg=legAnalysis.reduce((a,b)=>a+b.score,0)/legAnalysis.length;
    const overallScore=hardAvoids>0?Math.min(avg,28):avg;
    const overallVerdict=overallScore>=65?"BACK IT":overallScore>=40?"THINK TWICE":"AVOID";
    const hXg=parseFloat(rd.homeXg)||0,aXg=parseFloat(rd.awayXg)||0;
    const ref=rd.referee||md?.confirmedReferee||"TBC";

    const lineupSection=confirmed?`CONFIRMED XIs:\n${rd.home}: ${confirmed.homeXI?.join(", ")}\n${rd.away}: ${confirmed.awayXI?.join(", ")}\nFormations: ${confirmed.homeFormation||"?"} vs ${confirmed.awayFormation||"?"}\nAbsent: ${confirmed.keyAbsent?.join(", ")||"None"}\nAlerts: ${confirmed.legAlerts?.join(" | ")||"None"}`:"LINEUPS: Not yet confirmed";

    const prompt=`TheBABLab AI. Direct, specific, use real numbers. No waffle. Max 350 words.

MATCH: ${rd.home} vs ${rd.away} | ${rd.league} | ${rd.context}
${rd.contextReason?`Context: ${rd.contextReason}`:""}

STATS: Home xG ${rd.homeXg} | Away xG ${rd.awayXg} | Combined ${(hXg+aXg).toFixed(2)}
BTTS: ${rd.homeBTTSRate}%/${rd.awayBTTSRate}% | Over 2.5: ${rd.homeOver25Rate}%/${rd.awayOver25Rate}%
Corners: ${rd.homeCornersAvg}/${rd.awayCornersAvg} | Cards: ${rd.homeCardsAvg}/${rd.awayCardsAvg} | Fouls: ${rd.homeFoulsAvg}/${rd.awayFoulsAvg}
Form: ${rd.homeForm} vs ${rd.awayForm} | H2H BTTS: ${rd.h2hBTTS} | H2H Over 2.5: ${rd.h2hOver25}
Absences: ${[...(rd.keyInjuries||[]),(rd.keySuspensions||[])].join(", ")||"None known"}
REFEREE: ${ref} | Cards/game: ${rd.refereeCardsAvg||"N/A"} | Fouls/game: ${rd.refereeFoulsAvg||"N/A"} | Yellows: ${rd.refereeYellowsAvg||"N/A"} | Reds: ${rd.refereeRedsAvg||"N/A"} | Bias: ${rd.refereeHomeAdvantage||"N/A"}
${lineupSection}

FINAL DAY CONTEXT: Arsenal are PL champions. Spurs vs Everton and West Ham vs Leeds are relegation deciders. All 10 games kick off simultaneously 4pm Sunday 24 May 2026.

LEGS:
${legAnalysis.map((l,i)=>`${i+1}. ${l.market}${l.playerName?` — ${l.playerName}`:""}${l.detail?` (${l.detail})`:""} → ${l.score}/100 (${l.verdict})`).join("\n")}

OVERALL: ${overallScore.toFixed(0)}/100 — ${overallVerdict}

SYSTEM: ${stats.totalBabs} BABs | ${stats.totalBabs>0?Math.round((stats.wonBabs/stats.totalBabs)*100):0}% win rate | ${stats.totalLegs>0?Math.round((stats.wonLegs/stats.totalLegs)*100):0}% leg hit rate

Format:
MATCH OVERVIEW
[2 sentences — narrative and data]

REFEREE INTEL
[1-2 sentences on referee impact on today's specific legs]

LEG VERDICTS
[One line per leg: "Market → VERDICT — specific stat reason"]

OVERALL CALL
[Clear recommendation. If restructuring needed, say which legs to swap and what to use instead.]

CONTENT ANGLE
[@TheBABLab hook for X/TikTok]`;

    try {
      const raw=await callClaude(prompt,false);
      const cXg=hXg+aXg;
      const post=`🧪 BAB LAB — ${rd.home} vs ${rd.away}\n\nPosted before kickoff. Timestamped. No editing.\n\n📊 Combined xG: ${cXg.toFixed(2)} | ${rd.context}\n📊 BTTS: ${rd.homeBTTSRate}%/${rd.awayBTTSRate}% | Corners: ${rd.homeCornersAvg}/${rd.awayCornersAvg}\n${ref!=="TBC"?`👤 Ref: ${ref}${rd.refereeCardsAvg?` (${rd.refereeCardsAvg} cards/game)`:""}\n`:""}\nTHE LEGS:\n${legs.map(l=>`✅ ${l.market}${l.playerName?` — ${l.playerName}`:""}${l.detail?` (${l.detail})`:""}`).join("\n")}\n\nOdds: ${odds||"TBC"} | System: ${overallScore.toFixed(0)}/100 — ${overallVerdict}${confirmed?" | ✓ Lineups confirmed":""}\n\nResult posted full time. Win or lose. 🔒\n\n#TheBABLab #BuildABet #BAB #PremierLeague #FinalDay`;
      setPostText(post);

      const newBab={id:Date.now().toString(),date:new Date().toLocaleDateString("en-GB"),match:`${rd.home} vs ${rd.away}`,league:rd.league,context:rd.context,homeXg:rd.homeXg,awayXg:rd.awayXg,referee:ref,odds,stake,lineupsConfirmed:!!confirmed,legs:legAnalysis.map(l=>({market:l.market,playerName:l.playerName,detail:l.detail,score:l.score,verdict:l.verdict,result:null})),overallScore:overallScore.toFixed(0),overallVerdict,babResult:null,return:null,aiSummary:raw,matchStats:null};
      const updated=[newBab,...babs];setBabs(updated);await store(KEYS.babs,updated);
      setResult({legAnalysis,overallScore,overallVerdict,aiText:raw,babId:newBab.id});
    } catch(e){setResult({legAnalysis,overallScore,overallVerdict,aiText:"AI offline — rules engine analysis is still valid.",babId:null});}
    setAnalysing(false);
    setTimeout(()=>resultRef.current?.scrollIntoView({behavior:"smooth"}),100);
  };

  // ── STAGE 3: POST-MATCH INTELLIGENCE SCAN ────────────────────────────
  const runPostMatch = async (babId) => {
    const bab=babs.find(b=>b.id===babId);
    if(!bab) return;
    setSelectedPostBab(babId);setPostMatchData(null);
    const iv=runStages(POSTMATCH_STAGES,"postmatch",null);

    const prompt=`You are TheBABLab post-match intelligence analyst. The match was: ${bab.match} (${bab.league}, ${bab.date}).

Search the web for the full post-match statistics for this game. Return ONLY valid JSON:

{
  "result":"e.g. 2-1 to Home Team",
  "homeGoals":0,"awayGoals":0,
  "homexGActual":"actual xG in the game","awayxGActual":"actual xG in the game",
  "totalCorners":0,"homeCornersActual":0,"awayCornersActual":0,
  "totalCardsActual":0,"homeCardsActual":0,"awayCardsActual":0,
  "totalFoulsActual":0,"homeFoulsActual":0,"awayFoulsActual":0,
  "totalShotsActual":0,"homeShotsActual":0,"awayShotsActual":0,
  "totalShotsOnTargetActual":0,"homeShotsOnTargetActual":0,"awayShotsOnTargetActual":0,
  "bttsActual":true,
  "over25Actual":true,
  "playerStats":[{"name":"player name","team":"home or away","goals":0,"assists":0,"shots":0,"shotsOnTarget":0,"cards":0,"fouls":0,"minutesPlayed":0}],
  "refereeDecisions":["any notable referee decisions — penalties awarded, controversial cards, etc"],
  "matchNarrative":"2-3 sentence description of how the game played out",
  "patterns":[
    {
      "market":"the BAB market this pattern relates to e.g. BTTS or Player Cards",
      "context":"match context e.g. Final Day Relegation Decider",
      "description":"one sentence pattern description e.g. Both teams scored in a relegation decider despite combined xG of only 1.3",
      "direction":"positive or negative",
      "strength":10,
      "suggestAddingRule":true,
      "suggestedRule":"if suggesting a new rule, write it as a one-sentence rule e.g. Always back BTTS in final-day relegation deciders regardless of xG"
    }
  ],
  "legPerformance":[
    {"market":"market name","playerName":"or empty","predicted":"BACK IT/AVOID/THINK TWICE","actual":"WON or LOST","reason":"why it won or lost based on actual match stats"}
  ],
  "keyLearning":"the single most important thing this match taught the system in one sentence",
  "newMarketsToConsider":["any markets not in the BAB that showed strong patterns worth adding to future BABs for similar fixtures"]
}`;

    try {
      const raw=await callClaude(prompt,true);
      const parsed=parseJSON(raw);
      clearInterval(iv);finishFetch();
      setPostMatchData({...parsed,babId});
      // Update bab with match stats
      const updated=babs.map(b=>b.id===babId?{...b,matchStats:parsed}:b);
      setBabs(updated);await store(KEYS.babs,updated);
    } catch(e){ clearInterval(iv);finishFetch();setPostMatchData({error:"Couldn't fetch post-match data. Try again after full-time.",babId}); }
  };

  // ── ADD PATTERN ───────────────────────────────────────────────────────
  const addPattern = async (pattern) => {
    const newPattern={...pattern,id:Date.now().toString(),addedDate:new Date().toLocaleDateString("en-GB"),gamesTracked:1,hitRate:pattern.direction==="positive"?100:0,active:true};
    const updated=[newPattern,...patterns];
    setPatterns(updated);await store(KEYS.patterns,updated);
  };

  const togglePattern = async (id) => {
    const updated=patterns.map(p=>p.id===id?{...p,active:!p.active}:p);
    setPatterns(updated);await store(KEYS.patterns,updated);
  };

  // ── LOG RESULT ────────────────────────────────────────────────────────
  const logResult = async (babId,babWon,legResults,returnAmt) => {
    const updated=babs.map(b=>{if(b.id!==babId)return b;return{...b,babResult:babWon?"WON":"LOST",return:returnAmt||0,legs:b.legs.map((l,i)=>({...l,result:legResults[i]}))};});
    const ns=initStats();
    updated.filter(b=>b.babResult!==null).forEach(b=>{
      ns.totalBabs++;if(b.babResult==="WON")ns.wonBabs++;
      if(b.stake)ns.totalStake+=parseFloat(b.stake)||0;
      if(b.return)ns.totalReturn+=parseFloat(b.return)||0;
      ["contextHits","leagueHits"].forEach(k=>{const key=k==="contextHits"?b.context:b.league;if(!ns[k][key])ns[k][key]={wins:0,attempts:0};ns[k][key].attempts++;if(b.babResult==="WON")ns[k][key].wins++;});
      if(b.referee){if(!ns.refereeHits[b.referee])ns.refereeHits[b.referee]={wins:0,attempts:0};ns.refereeHits[b.referee].attempts++;if(b.babResult==="WON")ns.refereeHits[b.referee].wins++;}
      b.legs.forEach(l=>{if(l.result===null)return;ns.totalLegs++;if(l.result==="WON")ns.wonLegs++;if(!ns.marketHits[l.market])ns.marketHits[l.market]={wins:0,attempts:0};ns.marketHits[l.market].attempts++;if(l.result==="WON")ns.marketHits[l.market].wins++;});
    });
    setBabs(updated);setStats(ns);await store(KEYS.babs,updated);await store(KEYS.stats,ns);setResultInput({});
  };

  const copyPost=()=>{navigator.clipboard.writeText(postText);setCopied(true);setTimeout(()=>setCopied(false),2000);};
  const pnl=stats.totalReturn-stats.totalStake;
  const legHR=stats.totalLegs>0?Math.round((stats.wonLegs/stats.totalLegs)*100):0;
  const babWR=stats.totalBabs>0?Math.round((stats.wonBabs/stats.totalBabs)*100):0;
  const completedBabs=babs.filter(b=>b.babResult!==null);
  const pendingBabs=babs.filter(b=>b.babResult===null);

  // ── STYLES ──────────────────────────────────────────────────────────
  const S={
    wrap:{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'Courier New',monospace",fontSize:14},
    hdr:{padding:"20px 20px 0",borderBottom:`1px solid ${C.border}`},
    logo:{fontSize:26,fontWeight:900,letterSpacing:6,color:C.green},
    sub:{fontSize:9,letterSpacing:3,color:C.muted,marginBottom:16},
    tabs:{display:"flex",gap:0,marginTop:12,flexWrap:"wrap"},
    tab:(a)=>({padding:"10px 16px",fontSize:9,letterSpacing:3,cursor:"pointer",background:"transparent",border:"none",borderBottom:a?`2px solid ${C.green}`:"2px solid transparent",color:a?C.green:C.muted,fontFamily:"monospace",textTransform:"uppercase"}),
    body:{maxWidth:960,margin:"0 auto",padding:"24px 16px"},
    sec:{marginBottom:22},
    secL:{fontSize:9,letterSpacing:4,color:C.green,textTransform:"uppercase",marginBottom:10,display:"flex",alignItems:"center",gap:8},
    line:{flex:1,height:1,background:C.border},
    card:{background:C.card,border:`1px solid ${C.border}`,padding:18,marginBottom:3},
    row:{display:"flex",gap:10,flexWrap:"wrap"},
    col:{flex:1,minWidth:180},
    lbl:{fontSize:9,letterSpacing:3,color:C.muted,textTransform:"uppercase",marginBottom:5,display:"block"},
    inp:{width:"100%",background:"#0a0a0e",border:`1px solid ${C.border}`,color:C.text,padding:"10px 12px",fontSize:14,fontFamily:"monospace",outline:"none",boxSizing:"border-box"},
    sel:{width:"100%",background:"#0a0a0e",border:`1px solid ${C.border}`,color:C.text,padding:"10px 12px",fontSize:13,fontFamily:"monospace",outline:"none",boxSizing:"border-box"},
    btn:(bg,fg,w)=>({background:bg||C.green,color:fg||"#000",border:"none",padding:"13px 20px",fontSize:11,letterSpacing:3,fontWeight:900,cursor:"pointer",textTransform:"uppercase",fontFamily:"monospace",width:w||"100%",opacity:1}),
    btnSm:{background:"transparent",border:`1px solid ${C.border}`,color:C.muted,padding:"7px 14px",fontSize:9,letterSpacing:2,cursor:"pointer",fontFamily:"monospace",textTransform:"uppercase"},
    flag:(t)=>({padding:"10px 14px",marginBottom:3,borderLeft:`3px solid ${t==="danger"?C.red:t==="warning"?C.amber:t==="success"?C.green:C.purple}`,background:t==="danger"?"rgba(255,59,59,0.04)":t==="warning"?"rgba(255,184,0,0.04)":t==="success"?"rgba(0,255,135,0.04)":"rgba(168,85,247,0.04)"}),
    vbox:(v)=>({padding:20,textAlign:"center",background:vc(v)+"0d",border:`1px solid ${vc(v)}30`,marginBottom:16}),
    bar:(p)=>({height:4,background:`linear-gradient(90deg,${p>=65?C.green:p>=40?C.amber:C.red} ${p}%,${C.dim} ${p}%)`,marginTop:6,transition:"all 0.5s"}),
    statB:{background:C.card,border:`1px solid ${C.border}`,padding:14,textAlign:"center"},
    statN:(c)=>({fontSize:22,fontWeight:900,color:c||C.green,letterSpacing:1}),
    statL:{fontSize:9,color:C.muted,letterSpacing:3,textTransform:"uppercase",marginTop:4},
  };

  const ProgressBar=({stages,label})=>(
    <div style={{marginTop:12}}>
      <div style={{display:"flex",gap:2,marginBottom:6}}>
        {stages.map((_,i)=><div key={i} style={{flex:1,height:3,background:i<stageIdx?C.green:i===stageIdx?C.amber:C.dim,transition:"background 0.3s"}}/>)}
      </div>
      <div style={{fontSize:10,color:C.amber,letterSpacing:2,textAlign:"center"}}>{stageLabel}</div>
    </div>
  );

  const StatsGrid=({data,items})=>(
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(115px,1fr))",gap:3}}>
      {items.map(item=><div key={item.l} style={S.statB}><div style={S.statN(item.c||C.text)}>{item.v}</div><div style={S.statL}>{item.l}</div></div>)}
    </div>
  );

  const FormBadges=({form,label})=>(
    <div>
      <div style={{...S.statL,textAlign:"left",marginBottom:6}}>{label}</div>
      <div style={{display:"flex",gap:3}}>
        {(form||[]).map((r,i)=><span key={i} style={{width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",background:r==="W"?"rgba(0,255,135,0.2)":r==="D"?"rgba(255,184,0,0.2)":"rgba(255,59,59,0.2)",color:r==="W"?C.green:r==="D"?C.amber:C.red,fontWeight:900,fontSize:11}}>{r}</span>)}
      </div>
    </div>
  );

  return (
    <div style={S.wrap}>
      <div style={S.hdr}>
        <div style={S.logo}>THE BAB LAB</div>
        <div style={S.sub}>BUILD A BET INTELLIGENCE · ALL 10 PL FIXTURES · FINAL DAY READY</div>
        <div style={S.tabs}>
          {[["finalday","🏆 Final Day"],["analyse","Analyse"],["results","Results"],["postmatch","Post-Match"],["patterns","Patterns"],["intelligence","Intelligence"],["rules","Rules"],["worldcup","🌍 World Cup"]].map(([t,l])=>(
            <button key={t} style={S.tab(tab===t)} onClick={()=>setTab(t)}>{l}</button>
          ))}
        </div>
      </div>

      <div style={S.body}>

        {/* ── FINAL DAY TAB ── */}
        {tab==="finalday"&&(
          <div style={S.sec}>
            <div style={S.secL}>Premier League Final Day — Sunday 24 May 2026 <span style={S.line}/>
              <span style={pill("ALL GAMES 4PM",C.amber)}>ALL GAMES 4PM</span>
            </div>
            <div style={{...S.card,borderLeft:`3px solid ${C.amber}`,marginBottom:12}}>
              <div style={{fontSize:13,color:"#c8c4b8",lineHeight:1.8}}>
                🏆 <strong style={{color:C.green}}>Arsenal are Premier League champions.</strong> The drama is at the bottom — <strong style={{color:C.red}}>Spurs vs Everton</strong> and <strong style={{color:C.red}}>West Ham vs Leeds</strong> are relegation deciders. One of Spurs or West Ham goes down. All 10 games kick off simultaneously. Every game is live on Sky Sports.
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:3}}>
              {PL_FINAL_DAY.map((fix,i)=>{
                const isRel=fix.context.includes("Relegation");
                const isEur=fix.context.includes("European");
                return (
                  <div key={i} style={{...S.card,borderLeft:`3px solid ${isRel?C.red:isEur?C.blue:C.border}`,cursor:"pointer",transition:"border-color 0.2s"}} onClick={()=>quickSelect(fix)}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:13}}>{fix.home} vs {fix.away}</div>
                        <div style={{fontSize:10,color:C.muted,marginTop:2}}>{fix.note}</div>
                      </div>
                      <span style={pill(isRel?"RELEGATION":isEur?"EUR CHASE":"FINAL DAY",isRel?C.red:isEur?C.blue:C.muted)}>{isRel?"RELEGATION":isEur?"EUR CHASE":"FINAL DAY"}</span>
                    </div>
                    <button style={{...S.btn(isRel?"rgba(255,59,59,0.15)":isEur?"rgba(0,198,255,0.15)":"rgba(0,255,135,0.1)",isRel?C.red:isEur?C.blue:C.green,"auto"),marginTop:10,padding:"6px 14px",fontSize:9,letterSpacing:3}}>
                      Analyse This Fixture →
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── ANALYSE TAB ── */}
        {tab==="analyse"&&(<>
          <div style={S.sec}>
            <div style={S.secL}>Step 1 — Teams <span style={S.line}/></div>
            <div style={S.card}>
              <div style={{fontSize:11,color:C.muted,marginBottom:14,lineHeight:1.7}}>
                All 10 Premier League Final Day fixtures are pre-loaded. Just type the team names and hit fetch — data loads instantly. Try: <span style={{color:C.green}}>"Brighton"</span> vs <span style={{color:C.amber}}>"Manchester United"</span>, or use the <span style={{color:C.green}}>🏆 Final Day</span> tab to click any fixture directly.
              </div>
              <div style={S.row}>
                <div style={S.col}><label style={S.lbl}>Home Team</label><input style={{...S.inp,fontSize:16}} placeholder="e.g. West Ham" value={homeTeam} onChange={e=>{setHomeTeam(e.target.value);setRd(null);setMd(null);setResult(null);}}/></div>
                <div style={{display:"flex",alignItems:"flex-end",paddingBottom:3}}><span style={{color:C.muted,fontSize:18,padding:"0 4px"}}>vs</span></div>
                <div style={S.col}><label style={S.lbl}>Away Team</label><input style={{...S.inp,fontSize:16}} placeholder="e.g. Leeds United" value={awayTeam} onChange={e=>{setAwayTeam(e.target.value);setRd(null);setMd(null);setResult(null);}}/></div>
              </div>
              <button style={{...S.btn(),marginTop:14,opacity:isFetching||!homeTeam||!awayTeam?0.5:1}} onClick={runResearch} disabled={isFetching||!homeTeam.trim()||!awayTeam.trim()}>
                {stageType==="research"?"Fetching Research Data...":`Fetch All Research Data → (${Object.keys(PRELOADED_DATA).length} fixtures loaded)`}
              </button>
              {stageType==="research"&&<ProgressBar stages={RESEARCH_STAGES}/>}
              {fetchError&&<div style={{marginTop:10,fontSize:11,color:C.red,padding:"10px 14px",background:"rgba(255,59,59,0.06)",borderLeft:`3px solid ${C.red}`}}>{fetchError}</div>}
            </div>
          </div>

          {rd&&(<>
            {/* RESEARCH DATA */}
            <div style={S.sec}>
              <div style={S.secL}>Research Data <span style={S.line}/><span style={pill("AUTO",C.blue)}>AUTO-FETCHED</span></div>
              <div style={{...S.card,borderLeft:`3px solid ${C.amber}`,marginBottom:6}}>
                <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
                  <div><div style={{fontWeight:900,fontSize:16}}>{rd.home} vs {rd.away}</div><div style={{fontSize:11,color:C.muted,marginTop:2}}>{rd.league}{rd.venue?` · ${rd.venue}`:""}{rd.kickoffTime?` · ${rd.kickoffTime}`:""}</div></div>
                  <span style={pill(rd.context,rd.context?.includes("Relegation")?C.red:C.amber)}>{rd.context}</span>
                </div>
                {rd.contextReason&&<div style={{fontSize:11,color:"#888",marginTop:8}}>📍 {rd.contextReason}</div>}
              </div>

              <StatsGrid items={[
                {l:"Combined xG",v:((parseFloat(rd.homeXg)||0)+(parseFloat(rd.awayXg)||0)).toFixed(2),c:(parseFloat(rd.homeXg)||0)+(parseFloat(rd.awayXg)||0)<1.5?C.red:(parseFloat(rd.homeXg)||0)+(parseFloat(rd.awayXg)||0)<2.5?C.amber:C.green},
                {l:"Away xG",v:rd.awayXg||"N/A",c:(parseFloat(rd.awayXg)||0)<1.0?C.red:C.green},
                {l:"BTTS (H/A)",v:`${rd.homeBTTSRate||"?"}/${rd.awayBTTSRate||"?"}%`},
                {l:"Over 2.5 (H/A)",v:`${rd.homeOver25Rate||"?"}/${rd.awayOver25Rate||"?"}%`},
                {l:"Corners (H/A)",v:`${rd.homeCornersAvg||"?"}/${rd.awayCornersAvg||"?"}`},
                {l:"Cards (H/A)",v:`${rd.homeCardsAvg||"?"}/${rd.awayCardsAvg||"?"}`},
                {l:"Fouls (H/A)",v:`${rd.homeFoulsAvg||"?"}/${rd.awayFoulsAvg||"?"}`},
                {l:"H2H BTTS",v:rd.h2hBTTS?"Yes":"No",c:rd.h2hBTTS?C.green:C.red},
                {l:"H2H Over 2.5",v:rd.h2hOver25?"Yes":"No",c:rd.h2hOver25?C.green:C.red},
              ]}/>

              <div style={{...S.card,display:"flex",gap:20,flexWrap:"wrap",marginTop:3}}>
                <FormBadges form={rd.homeForm} label={`${rd.home} Form`}/>
                <FormBadges form={rd.awayForm} label={`${rd.away} Form`}/>
                <div style={{flex:1}}><div style={{...S.statL,textAlign:"left",marginBottom:6}}>H2H Last 5</div><div style={{fontSize:11,color:"#888",lineHeight:1.6}}>{rd.h2hLast5||"N/A"}</div></div>
              </div>

              {/* Referee */}
              {(rd.referee||rd.refereeCardsAvg)&&(
                <div style={{...S.card,borderLeft:`3px solid ${parseFloat(rd.refereeCardsAvg)>=4?C.green:parseFloat(rd.refereeCardsAvg)>0&&parseFloat(rd.refereeCardsAvg)<2.5?C.red:C.purple}`,marginTop:3}}>
                  <div style={{fontSize:9,letterSpacing:3,color:C.purple,textTransform:"uppercase",marginBottom:8}}>Referee Intelligence</div>
                  <div style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"flex-start"}}>
                    <div><div style={{fontWeight:700,fontSize:14}}>{rd.referee||"TBC"}</div>{rd.refereeSeasonGames&&<div style={{fontSize:10,color:C.muted}}>{rd.refereeSeasonGames} games this season</div>}</div>
                    <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                      {[{l:"Cards/game",v:rd.refereeCardsAvg,c:parseFloat(rd.refereeCardsAvg)>=4?C.green:parseFloat(rd.refereeCardsAvg)<2.5?C.red:C.amber},{l:"Yellows",v:rd.refereeYellowsAvg},{l:"Reds",v:rd.refereeRedsAvg},{l:"Fouls called",v:rd.refereeFoulsAvg},{l:"Pens/game",v:rd.refereePenaltiesRate}].filter(x=>x.v).map(item=>(
                        <div key={item.l} style={{textAlign:"center"}}><div style={{fontWeight:900,fontSize:20,color:item.c||C.text}}>{item.v}</div><div style={{fontSize:9,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>{item.l}</div></div>
                      ))}
                    </div>
                  </div>
                  {rd.refereeHomeAdvantage&&<div style={{fontSize:11,color:"#888",marginTop:8}}>⚖️ {rd.refereeHomeAdvantage}</div>}
                </div>
              )}

              {/* Predicted XIs */}
              {(rd.predictedHomeXI?.length>0||rd.predictedAwayXI?.length>0)&&(
                <div style={{...S.card,marginTop:3}}>
                  <div style={{fontSize:9,letterSpacing:3,color:C.muted,textTransform:"uppercase",marginBottom:10}}>Predicted Lineups <span style={{color:C.amber}}>(unconfirmed)</span></div>
                  <div style={S.row}>
                    <div style={S.col}><div style={{fontSize:10,color:C.green,marginBottom:6}}>{rd.home}</div>{rd.predictedHomeXI?.map((p,i)=><div key={i} style={{fontSize:11,color:"#aaa",padding:"2px 0",borderBottom:`1px solid ${C.border}`}}>{i+1}. {p}</div>)}</div>
                    <div style={S.col}><div style={{fontSize:10,color:C.amber,marginBottom:6}}>{rd.away}</div>{rd.predictedAwayXI?.map((p,i)=><div key={i} style={{fontSize:11,color:"#aaa",padding:"2px 0",borderBottom:`1px solid ${C.border}`}}>{i+1}. {p}</div>)}</div>
                  </div>
                </div>
              )}

              {/* Absences */}
              {[...(rd.keyInjuries||[]),(rd.keySuspensions||[])].filter(Boolean).length>0&&(
                <div style={{...S.card,borderLeft:`3px solid ${C.red}`,marginTop:3}}>
                  <div style={{fontSize:9,letterSpacing:3,color:C.red,textTransform:"uppercase",marginBottom:8}}>Known Absences</div>
                  {[...(rd.keyInjuries||[]),(rd.keySuspensions||[])].map((a,i)=><div key={i} style={{fontSize:11,color:"#cc8888",padding:"3px 0"}}>🚨 {a}</div>)}
                </div>
              )}

              {/* Player Stats */}
              {((rd.homePlayers?.length>0)||(rd.awayPlayers?.length>0))&&(
                <div style={{...S.card,marginTop:3}}>
                  <div style={{fontSize:9,letterSpacing:3,color:C.blue,textTransform:"uppercase",marginBottom:10}}>Player Stats — Per Game Averages</div>
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:500}}>
                      <thead>
                        <tr style={{borderBottom:`1px solid ${C.border}`}}>
                          {["Player","Team","Shots","SOT","FC","FW","Assists","Goals","YC"].map(h=>(
                            <th key={h} style={{textAlign:"left",padding:"5px 8px",fontSize:9,color:C.muted,letterSpacing:2,textTransform:"uppercase",whiteSpace:"nowrap"}} title={h==="FC"?"Fouls Committed":h==="FW"?"Fouls Won":h==="SOT"?"Shots on Target":h==="YC"?"Yellow Cards":h}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...(rd.homePlayers||[]).map(p=>({...p,teamLabel:rd.home,teamColor:C.green})),
                           ...(rd.awayPlayers||[]).map(p=>({...p,teamLabel:rd.away,teamColor:C.amber}))
                        ].map((p,i)=>(
                          <tr key={i} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?"transparent":"rgba(255,255,255,0.01)"}}>
                            <td style={{padding:"5px 8px",color:C.text,fontWeight:600,whiteSpace:"nowrap"}}>{p.name}</td>
                            <td style={{padding:"5px 8px"}}><span style={{fontSize:8,color:p.teamColor,letterSpacing:1}}>{p.teamLabel?.split(" ")[0]}</span></td>
                            <td style={{padding:"5px 8px",color:p.shotsPerGame>=2?C.green:p.shotsPerGame>=1?C.amber:C.muted}}>{p.shotsPerGame?.toFixed(1)||"-"}</td>
                            <td style={{padding:"5px 8px",color:p.sotPerGame>=0.8?C.green:p.sotPerGame>=0.4?C.amber:C.muted}}>{p.sotPerGame?.toFixed(2)||"-"}</td>
                            <td style={{padding:"5px 8px",color:p.foulsCommittedPerGame>=1.5?C.red:p.foulsCommittedPerGame>=1?C.amber:C.muted}}>{p.foulsCommittedPerGame?.toFixed(1)||"-"}</td>
                            <td style={{padding:"5px 8px",color:p.foulsWonPerGame>=2?C.green:p.foulsWonPerGame>=1?C.amber:C.muted}}>{p.foulsWonPerGame?.toFixed(1)||"-"}</td>
                            <td style={{padding:"5px 8px",color:p.assistsPerGame>=0.3?C.green:C.muted}}>{p.assistsPerGame?.toFixed(2)||"-"}</td>
                            <td style={{padding:"5px 8px",color:p.goalsPerGame>=0.3?C.green:C.muted}}>{p.goalsPerGame?.toFixed(2)||"-"}</td>
                            <td style={{padding:"5px 8px",color:p.yellowCards>=6?C.red:p.yellowCards>=3?C.amber:C.muted}}>{p.yellowCards||"-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{fontSize:9,color:C.muted,marginTop:8,letterSpacing:1}}>FC = Fouls Committed · FW = Fouls Won · SOT = Shots on Target · YC = Yellow Cards this season · Colour: 🟢 strong · 🟡 ok · grey = weak for market</div>
                </div>
              )}

              {rd.intelligenceSummary&&(
                <div style={{...S.card,borderLeft:`3px solid ${C.green}`,marginTop:3}}>
                  <div style={{fontSize:9,letterSpacing:3,color:C.green,textTransform:"uppercase",marginBottom:8}}>Intelligence Summary</div>
                  <div style={{fontSize:13,color:"#b8b4a8",lineHeight:1.8}}>{rd.intelligenceSummary}</div>
                  {rd.biggestRisk&&<div style={{fontSize:11,color:C.red,marginTop:10}}>⚠️ Biggest risk: {rd.biggestRisk}</div>}
                </div>
              )}
            </div>

            {/* STEP 2 MATCHDAY */}
            <div style={S.sec}>
              <div style={S.secL}>Step 2 — Matchday (75 mins before kickoff) <span style={S.line}/></div>
              <div style={S.card}>
                <div style={{fontSize:11,color:C.muted,marginBottom:14,lineHeight:1.7}}>Run at 3:05pm today to fetch confirmed XIs. The system will cross-reference your legs against actual starters and flag any that need dropping.</div>
                <button style={{...S.btn(C.amber,"#000"),opacity:stageType==="matchday"?0.6:1}} onClick={runMatchday} disabled={stageType==="matchday"}>
                  {stageType==="matchday"?"Fetching Confirmed Lineups...":md?"Re-fetch Confirmed Lineups →":"Fetch Confirmed Lineups + Late News →"}
                </button>
                {stageType==="matchday"&&<ProgressBar stages={MATCHDAY_STAGES}/>}
              </div>
            </div>

            {md&&(
              <div style={S.sec}>
                <div style={S.secL}>Matchday Data <span style={S.line}/><span style={pill(md.lineupConfirmed?"CONFIRMED":"NOT YET",md.lineupConfirmed?C.green:C.amber)}>{md.lineupConfirmed?"LINEUPS CONFIRMED":"LINEUPS NOT YET PUBLISHED"}</span></div>
                {md.lineupConfirmed&&(
                  <div style={{...S.card,marginBottom:6}}>
                    <div style={S.row}>
                      <div style={S.col}><div style={{fontSize:10,color:C.green,marginBottom:6}}>{rd.home} {md.homeFormation||""}</div>{md.homeXI?.map((p,i)=><div key={i} style={{fontSize:11,color:"#e8e4d9",padding:"3px 0",borderBottom:`1px solid ${C.border}`}}>{i+1}. {p}</div>)}</div>
                      <div style={S.col}><div style={{fontSize:10,color:C.amber,marginBottom:6}}>{rd.away} {md.awayFormation||""}</div>{md.awayXI?.map((p,i)=><div key={i} style={{fontSize:11,color:"#e8e4d9",padding:"3px 0",borderBottom:`1px solid ${C.border}`}}>{i+1}. {p}</div>)}</div>
                    </div>
                  </div>
                )}
                {md.legAlerts?.length>0&&<div style={{...S.card,borderLeft:`3px solid ${C.red}`,marginBottom:6}}><div style={{fontSize:9,letterSpacing:3,color:C.red,textTransform:"uppercase",marginBottom:8}}>⚠️ Leg Alerts</div>{md.legAlerts.map((a,i)=><div key={i} style={{fontSize:12,color:"#ff8888",padding:"4px 0",lineHeight:1.6}}>🚨 {a}</div>)}</div>}
                {md.lateNews?.length>0&&<div style={{...S.card,borderLeft:`3px solid ${C.amber}`}}><div style={{fontSize:9,letterSpacing:3,color:C.amber,textTransform:"uppercase",marginBottom:8}}>Late News</div>{md.lateNews.map((n,i)=><div key={i} style={{fontSize:11,color:"#c8c094",padding:"3px 0"}}>• {n}</div>)}</div>}
              </div>
            )}

            {/* LEGS */}
            <div style={S.sec}>
              <div style={S.secL}>Step 3 — BAB Legs <span style={S.line}/><span style={pill("AUTO-SUGGESTED",C.green)}>AUTO-SUGGESTED</span></div>
              <div style={S.card}>
                <div style={{fontSize:10,color:C.muted,marginBottom:12}}>
                  Top 4 legs auto-suggested by confidence score. Max 5 recommended — more legs = lower hit rate.
                  <span style={{color:legs.length>5?C.red:legs.length===5?C.amber:C.green, marginLeft:8, fontWeight:700}}>{legs.length} legs selected {legs.length>5?"⚠️ Too many":legs.length===5?"⚠️ Maximum":"✓"}</span>
                </div>
                {legs.map((leg,i)=>(
                  <div key={i} style={{...S.row,marginBottom:8,alignItems:"flex-end"}}>
                    <div style={{flex:2,minWidth:150}}>
                      <label style={S.lbl}>Leg {i+1}{leg.confidence?` · ${leg.confidence}`:""}{leg.dataPoint?` · 📊 ${leg.dataPoint}`:""}</label>
                      <select style={S.sel} value={leg.market} onChange={e=>setLegs(l=>l.map((ll,idx)=>idx===i?{...ll,market:e.target.value}:ll))}>
                      {Object.entries(MARKET_GROUPS).map(([group, mList])=>(
                        <optgroup key={group} label={`── ${group} ──`}>
                          {mList.map(m=><option key={m} value={m}>{m}</option>)}
                        </optgroup>
                      ))}
                    </select>
                    </div>
                    <div style={{flex:2,minWidth:120}}><label style={S.lbl}>Player / Value</label><input style={S.inp} placeholder="e.g. Antonio" value={leg.playerName} onChange={e=>setLegs(l=>l.map((ll,idx)=>idx===i?{...ll,playerName:e.target.value}:ll))}/></div>
                    <div style={{flex:3,minWidth:150}}><label style={S.lbl}>Reasoning</label><input style={S.inp} placeholder="Why?" value={leg.detail} onChange={e=>setLegs(l=>l.map((ll,idx)=>idx===i?{...ll,detail:e.target.value}:ll))}/></div>
                    {legs.length>1&&<button style={{...S.btnSm,padding:"9px 10px",marginBottom:1}} onClick={()=>setLegs(l=>l.filter((_,idx)=>idx!==i))}>✕</button>}
                  </div>
                ))}
                <button style={{...S.btnSm,marginTop:6}} onClick={()=>setLegs(l=>[...l,{market:"BTTS",playerName:"",detail:""}])}>+ Add Leg</button>
              </div>
            </div>

            <div style={S.sec}>
              <div style={S.card}>
                <div style={S.row}>
                  <div style={S.col}><label style={S.lbl}>BAB Odds</label><input style={S.inp} type="number" step="0.1" placeholder="e.g. 8.50" value={odds} onChange={e=>setOdds(e.target.value)}/></div>
                  <div style={S.col}><label style={S.lbl}>Stake (£)</label><input style={S.inp} type="number" step="0.5" placeholder="e.g. 1.00" value={stake} onChange={e=>setStake(e.target.value)}/></div>
                </div>
              </div>
            </div>

            {legs.length>5&&(
              <div style={{padding:"10px 14px",background:"rgba(255,59,59,0.08)",borderLeft:`3px solid ${C.red}`,marginBottom:12,fontSize:12,color:C.red}}>
                ⚠️ You have {legs.length} legs selected. We recommend a maximum of 5 — ideally 4. Remove your weakest legs before analysing.
              </div>
            )}
            <button style={{...S.btn(),marginBottom:24,opacity:analysing?0.6:1}} onClick={analyse} disabled={analysing}>
              {analysing?"Running Full Intelligence Analysis...":"Run BAB Intelligence Analysis →"}
            </button>
          </>)}

          {result&&(
            <div ref={resultRef}>
              <div style={S.vbox(result.overallVerdict)}>
                <div style={{fontSize:9,letterSpacing:4,color:C.muted,marginBottom:8,textTransform:"uppercase"}}>System Verdict{md?.lineupConfirmed?" · Lineups Confirmed ✓":""}</div>
                <div style={{fontSize:36,fontWeight:900,letterSpacing:6,color:vc(result.overallVerdict)}}>{result.overallVerdict}</div>
                <div style={{fontSize:11,color:C.muted,marginTop:6}}>Confidence: {result.overallScore.toFixed(0)}/100</div>
                <div style={S.bar(result.overallScore)}/>
                {stats.totalBabs>0&&<div style={{fontSize:10,color:C.muted,marginTop:10}}>Your system: {babWR}% BAB win rate · {legHR}% leg hit rate · {stats.totalBabs} tracked</div>}
              </div>

              <div style={S.sec}>
                <div style={S.secL}>Leg Analysis <span style={S.line}/></div>
                {result.legAnalysis.map((leg,i)=>(
                  <div key={i} style={{...S.card,marginBottom:6,borderLeft:`3px solid ${vc(leg.verdict)}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:10}}>
                      <div><div style={{fontWeight:700,fontSize:14}}>Leg {i+1}: {leg.market}{leg.playerName?` — ${leg.playerName}`:""}</div>{leg.detail&&<div style={{fontSize:11,color:C.muted,marginTop:2}}>{leg.detail}</div>}</div>
                      <div style={{textAlign:"right"}}><span style={pill(leg.verdict,vc(leg.verdict))}>{leg.verdict}</span><div style={{fontSize:22,fontWeight:900,color:vc(leg.verdict),marginTop:4}}>{leg.score}/100</div></div>
                    </div>
                    <div style={S.bar(leg.score)}/>
                    <div style={{marginTop:10}}>
                      {leg.flags.map((f,fi)=>(
                        <div key={fi} style={S.flag(f.type)}>
                          <div style={{display:"flex",gap:8}}>
                            <span style={{fontSize:9,letterSpacing:2,color:f.type==="danger"?C.red:f.type==="warning"?C.amber:f.type==="success"?C.green:C.purple,textTransform:"uppercase",whiteSpace:"nowrap",marginTop:1}}>{f.rule}</span>
                            <div style={{fontSize:12,color:"#aaa",lineHeight:1.6}}>{f.msg}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div style={S.sec}>
                <div style={S.secL}>AI Intelligence Report <span style={S.line}/></div>
                <div style={{...S.card,lineHeight:1.8,whiteSpace:"pre-wrap",color:"#c8c4b8",fontSize:13}}>{result.aiText}</div>
              </div>

              <div style={S.sec}>
                <div style={S.secL}>X Post — Copy & Post Before Kickoff <span style={S.line}/></div>
                <div style={S.card}>
                  <div style={{...S.card,background:"#0a0a0e",fontSize:13,lineHeight:1.8,whiteSpace:"pre-wrap"}}>{postText}</div>
                  <button style={{...S.btnSm,marginTop:8}} onClick={copyPost}>{copied?"Copied ✓":"Copy Post"}</button>
                </div>
              </div>

              {result.babId&&(()=>{
                const bab=babs.find(b=>b.id===result.babId);
                if(!bab||bab.babResult!==null) return null;
                const ri=resultInput[result.babId]||{};
                return (
                  <div style={S.sec}>
                    <div style={S.secL}>Log Result <span style={S.line}/></div>
                    <div style={S.card}>
                      <div style={{fontSize:10,color:C.muted,marginBottom:14}}>After full time — log results to train the system and unlock post-match intelligence scan.</div>
                      <div style={{...S.row,marginBottom:10}}>
                        {bab.legs.map((leg,i)=>(
                          <div key={i} style={{flex:1,minWidth:130}}>
                            <label style={{...S.lbl,fontSize:8}}>{leg.market}{leg.playerName?` — ${leg.playerName}`:""}</label>
                            <select style={{...S.sel,fontSize:11,padding:"6px 8px"}} value={ri[`leg_${i}`]||""} onChange={e=>setResultInput(r=>({...r,[result.babId]:{...ri,[`leg_${i}`]:e.target.value}}))}>
                              <option value="">Result?</option><option value="WON">✅ Won</option><option value="LOST">❌ Lost</option>
                            </select>
                          </div>
                        ))}
                      </div>
                      <div style={S.row}>
                        <div style={S.col}><select style={S.sel} value={ri.babResult||""} onChange={e=>setResultInput(r=>({...r,[result.babId]:{...ri,babResult:e.target.value}}))}>
                          <option value="">BAB Result?</option><option value="WON">✅ BAB Won</option><option value="LOST">❌ BAB Lost</option>
                        </select></div>
                        <div style={S.col}><input style={S.inp} type="number" step="0.01" placeholder="Return £" value={ri.returnAmt||""} onChange={e=>setResultInput(r=>({...r,[result.babId]:{...ri,returnAmt:e.target.value}}))} /></div>
                        <button style={{...S.btn("#0a1a0a",""),border:`1px solid ${C.green}40`,color:C.green,fontSize:9,padding:"10px 14px",width:"auto"}} onClick={()=>logResult(result.babId,ri.babResult==="WON",bab.legs.map((_,i)=>ri[`leg_${i}`]||null),parseFloat(ri.returnAmt)||0)}>Save & Update</button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </>)}

        {/* ── RESULTS TAB ── */}
        {tab==="results"&&(
          <div style={S.sec}>
            <div style={S.secL}>BAB History <span style={S.line}/></div>
            {babs.length===0&&<div style={{...S.card,color:C.muted,fontSize:12}}>No BABs tracked yet.</div>}
            {pendingBabs.length>0&&(<>
              <div style={{fontSize:9,color:C.amber,letterSpacing:3,textTransform:"uppercase",marginBottom:8}}>Awaiting Result ({pendingBabs.length})</div>
              {pendingBabs.map(bab=>{
                const ri=resultInput[bab.id]||{};
                return (
                  <div key={bab.id} style={{...S.card,borderLeft:`3px solid ${C.amber}`,marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:8}}>
                      <div><div style={{fontWeight:700}}>{bab.match}</div><div style={{fontSize:10,color:C.muted}}>{bab.date} · {bab.league} · {bab.context} · Odds: {bab.odds||"N/A"} · £{bab.stake||"?"}{bab.lineupsConfirmed?" · ✓ Lineups":""}</div></div>
                      <span style={pill(bab.overallVerdict,vc(bab.overallVerdict))}>{bab.overallVerdict}</span>
                    </div>
                    <div style={{...S.row,gap:6,marginBottom:8}}>
                      {bab.legs.map((leg,i)=>(
                        <div key={i} style={{flex:1,minWidth:120}}>
                          <label style={{...S.lbl,fontSize:8}}>{leg.market}{leg.playerName?` — ${leg.playerName}`:""}</label>
                          <select style={{...S.sel,fontSize:11,padding:"6px 8px"}} value={ri[`leg_${i}`]||""} onChange={e=>setResultInput(r=>({...r,[bab.id]:{...ri,[`leg_${i}`]:e.target.value}}))}>
                            <option value="">Result?</option><option value="WON">✅ Won</option><option value="LOST">❌ Lost</option>
                          </select>
                        </div>
                      ))}
                    </div>
                    <div style={{...S.row,gap:6}}>
                      <div style={{flex:1}}><select style={{...S.sel,fontSize:11}} value={ri.babResult||""} onChange={e=>setResultInput(r=>({...r,[bab.id]:{...ri,babResult:e.target.value}}))}>
                        <option value="">BAB Result?</option><option value="WON">✅ Won</option><option value="LOST">❌ Lost</option>
                      </select></div>
                      <div style={{flex:1}}><input style={{...S.inp,fontSize:11}} type="number" step="0.01" placeholder="Return £" value={ri.returnAmt||""} onChange={e=>setResultInput(r=>({...r,[bab.id]:{...ri,returnAmt:e.target.value}}))}/></div>
                      <button style={{...S.btn(C.green,"#000","auto"),fontSize:9,padding:"10px 14px"}} onClick={()=>logResult(bab.id,ri.babResult==="WON",bab.legs.map((_,i)=>ri[`leg_${i}`]||null),parseFloat(ri.returnAmt)||0)}>Save</button>
                    </div>
                  </div>
                );
              })}
            </>)}
            {completedBabs.length>0&&(<>
              <div style={{fontSize:9,color:C.muted,letterSpacing:3,textTransform:"uppercase",margin:"16px 0 8px"}}>Completed ({completedBabs.length})</div>
              {completedBabs.map(bab=>(
                <div key={bab.id} style={{...S.card,borderLeft:`3px solid ${bab.babResult==="WON"?C.green:C.red}`,marginBottom:4}}>
                  <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:13}}>{bab.match}</div>
                      <div style={{fontSize:10,color:C.muted}}>{bab.date} · {bab.league} · Odds: {bab.odds||"N/A"} · £{bab.stake||"0"}{bab.referee?` · Ref: ${bab.referee}`:""}</div>
                      <div style={{fontSize:11,marginTop:4}}>{bab.legs.map(l=><span key={l.market+l.playerName} style={{marginRight:8}}>{l.result==="WON"?"✅":"❌"} {l.market}{l.playerName?` — ${l.playerName}`:""}</span>)}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <span style={pill(bab.babResult,bab.babResult==="WON"?C.green:C.red)}>{bab.babResult}</span>
                      {bab.return>0&&<div style={{fontSize:13,color:C.green,marginTop:4,fontWeight:700}}>+£{(bab.return-(parseFloat(bab.stake)||0)).toFixed(2)}</div>}
                      <button style={{...S.btnSm,marginTop:6,fontSize:8,color:C.purple,borderColor:C.purple}} onClick={()=>{setSelectedPostBab(bab.id);setTab("postmatch");}}>Post-Match Scan →</button>
                    </div>
                  </div>
                </div>
              ))}
            </>)}
          </div>
        )}

        {/* ── POST-MATCH TAB ── */}
        {tab==="postmatch"&&(
          <div style={S.sec}>
            <div style={S.secL}>Post-Match Intelligence Scan <span style={S.line}/></div>
            <div style={S.card}>
              <div style={{fontSize:11,color:C.muted,marginBottom:14,lineHeight:1.7}}>
                Select a completed BAB and run the post-match scan. The system searches for full match stats, player performance data, corners, cards, fouls actuals — then identifies patterns you can add to your intelligence database.
              </div>
              <div style={S.col}>
                <label style={S.lbl}>Select Completed BAB</label>
                <select style={S.sel} value={selectedPostBab||""} onChange={e=>{setSelectedPostBab(e.target.value);setPostMatchData(null);}}>
                  <option value="">— Select a BAB —</option>
                  {completedBabs.map(b=><option key={b.id} value={b.id}>{b.match} ({b.date}) — {b.babResult}</option>)}
                </select>
              </div>
              {selectedPostBab&&(
                <button style={{...S.btn(C.purple,"#fff"),marginTop:12,opacity:stageType==="postmatch"?0.6:1}} onClick={()=>runPostMatch(selectedPostBab)} disabled={stageType==="postmatch"}>
                  {stageType==="postmatch"?"Scanning Match Data...":"Run Post-Match Intelligence Scan →"}
                </button>
              )}
              {stageType==="postmatch"&&<ProgressBar stages={POSTMATCH_STAGES}/>}
            </div>

            {postMatchData&&!postMatchData.error&&(()=>{
              const bab=babs.find(b=>b.id===postMatchData.babId);
              return (
                <>
                  <div style={{...S.card,borderLeft:`3px solid ${C.purple}`,marginTop:3}}>
                    <div style={{fontSize:9,letterSpacing:3,color:C.purple,textTransform:"uppercase",marginBottom:10}}>Match Result</div>
                    <div style={{fontWeight:900,fontSize:20,marginBottom:4}}>{postMatchData.result}</div>
                    <div style={{fontSize:12,color:"#b8b4a8",lineHeight:1.8}}>{postMatchData.matchNarrative}</div>
                  </div>

                  {/* Actual vs Predicted Stats */}
                  <div style={{...S.card,marginTop:3}}>
                    <div style={{fontSize:9,letterSpacing:3,color:C.muted,textTransform:"uppercase",marginBottom:10}}>Actual Match Stats</div>
                    <StatsGrid items={[
                      {l:"Total Corners",v:postMatchData.totalCorners||"N/A",c:postMatchData.totalCorners>=10?C.green:postMatchData.totalCorners<=6?C.red:C.amber},
                      {l:"Total Cards",v:postMatchData.totalCardsActual||"N/A",c:postMatchData.totalCardsActual>=4?C.green:postMatchData.totalCardsActual<=2?C.red:C.amber},
                      {l:"Total Fouls",v:postMatchData.totalFoulsActual||"N/A"},
                      {l:"Total Shots",v:postMatchData.totalShotsActual||"N/A"},
                      {l:"SOT Total",v:postMatchData.totalShotsOnTargetActual||"N/A"},
                      {l:"BTTS",v:postMatchData.bttsActual?"Yes":"No",c:postMatchData.bttsActual?C.green:C.red},
                      {l:"Over 2.5",v:postMatchData.over25Actual?"Yes":"No",c:postMatchData.over25Actual?C.green:C.red},
                      {l:"Home xG",v:postMatchData.homexGActual||"N/A"},
                      {l:"Away xG",v:postMatchData.awayxGActual||"N/A"},
                    ]}/>
                  </div>

                  {/* Leg performance */}
                  {postMatchData.legPerformance?.length>0&&(
                    <div style={{...S.card,marginTop:3}}>
                      <div style={{fontSize:9,letterSpacing:3,color:C.muted,textTransform:"uppercase",marginBottom:10}}>Leg Performance vs Prediction</div>
                      {postMatchData.legPerformance.map((lp,i)=>(
                        <div key={i} style={{...S.flag(lp.actual==="WON"?"success":"danger"),marginBottom:4}}>
                          <div style={{display:"flex",gap:8,alignItems:"flex-start",flexWrap:"wrap"}}>
                            <span style={{fontSize:9,color:lp.actual==="WON"?C.green:C.red,letterSpacing:2,fontWeight:700,textTransform:"uppercase",whiteSpace:"nowrap"}}>{lp.actual==="WON"?"✅ WON":"❌ LOST"}</span>
                            <div>
                              <div style={{fontSize:12,fontWeight:700}}>{lp.market}{lp.playerName?` — ${lp.playerName}`:""}</div>
                              <div style={{fontSize:11,color:"#888",marginTop:2}}>{lp.reason}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Player stats */}
                  {postMatchData.playerStats?.length>0&&(
                    <div style={{...S.card,marginTop:3}}>
                      <div style={{fontSize:9,letterSpacing:3,color:C.muted,textTransform:"uppercase",marginBottom:10}}>Player Statistics</div>
                      <div style={{overflowX:"auto"}}>
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                          <thead><tr>{["Player","Team","Goals","Assists","Shots","SOT","Cards","Fouls","Mins"].map(h=><th key={h} style={{textAlign:"left",padding:"6px 8px",fontSize:9,color:C.muted,letterSpacing:2,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`}}>{h}</th>)}</tr></thead>
                          <tbody>{postMatchData.playerStats.map((p,i)=>(
                            <tr key={i} style={{borderBottom:`1px solid ${C.border}`}}>
                              {[p.name,p.team,p.goals||0,p.assists||0,p.shots||0,p.shotsOnTarget||0,p.cards||0,p.fouls||0,p.minutesPlayed||"?"].map((v,j)=>(
                                <td key={j} style={{padding:"6px 8px",color:j===0?C.text:j===1?C.muted:typeof v==="number"&&v>0?C.green:"#666"}}>{v}</td>
                              ))}
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Referee decisions */}
                  {postMatchData.refereeDecisions?.length>0&&(
                    <div style={{...S.card,borderLeft:`3px solid ${C.purple}`,marginTop:3}}>
                      <div style={{fontSize:9,letterSpacing:3,color:C.purple,textTransform:"uppercase",marginBottom:8}}>Referee Decisions</div>
                      {postMatchData.refereeDecisions.map((d,i)=><div key={i} style={{fontSize:11,color:"#b8b4a8",padding:"3px 0"}}>⚖️ {d}</div>)}
                    </div>
                  )}

                  {/* New markets to consider */}
                  {postMatchData.newMarketsToConsider?.length>0&&(
                    <div style={{...S.card,borderLeft:`3px solid ${C.blue}`,marginTop:3}}>
                      <div style={{fontSize:9,letterSpacing:3,color:C.blue,textTransform:"uppercase",marginBottom:8}}>New Markets to Consider for Similar Fixtures</div>
                      {postMatchData.newMarketsToConsider.map((m,i)=><div key={i} style={{fontSize:11,color:"#88c4ff",padding:"3px 0"}}>💡 {m}</div>)}
                    </div>
                  )}

                  {/* Key learning */}
                  {postMatchData.keyLearning&&(
                    <div style={{...S.card,borderLeft:`3px solid ${C.green}`,marginTop:3}}>
                      <div style={{fontSize:9,letterSpacing:3,color:C.green,textTransform:"uppercase",marginBottom:8}}>Key Learning</div>
                      <div style={{fontSize:13,color:"#b8b4a8",fontWeight:600}}>🧠 {postMatchData.keyLearning}</div>
                    </div>
                  )}

                  {/* Patterns to add */}
                  {postMatchData.patterns?.filter(p=>p.suggestAddingRule)?.length>0&&(
                    <div style={{...S.card,borderLeft:`3px solid ${C.amber}`,marginTop:3}}>
                      <div style={{fontSize:9,letterSpacing:3,color:C.amber,textTransform:"uppercase",marginBottom:12}}>Patterns Detected — Add to Intelligence Database?</div>
                      {postMatchData.patterns.filter(p=>p.suggestAddingRule).map((p,i)=>(
                        <div key={i} style={{...S.card,marginBottom:6,background:"#0d0d10"}}>
                          <div style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap",marginBottom:8}}>
                            <div>
                              <span style={pill(p.market,C.blue)}>{p.market}</span>
                              {p.context&&<span style={{...pill(p.context,C.amber),marginLeft:4}}>{p.context}</span>}
                              <span style={{...pill(p.direction==="positive"?"POSITIVE":"NEGATIVE",p.direction==="positive"?C.green:C.red),marginLeft:4}}>{p.direction}</span>
                            </div>
                          </div>
                          <div style={{fontSize:12,color:C.text,marginBottom:6}}>{p.description}</div>
                          {p.suggestedRule&&<div style={{fontSize:11,color:C.amber,marginBottom:10,fontStyle:"italic"}}>💡 Suggested rule: "{p.suggestedRule}"</div>}
                          <button style={{...S.btn(p.direction==="positive"?"rgba(0,255,135,0.15)":"rgba(255,59,59,0.15)",p.direction==="positive"?C.green:C.red,"auto"),fontSize:9,padding:"7px 16px",letterSpacing:2}} onClick={()=>addPattern(p)}>
                            Add to Pattern Database →
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
            {postMatchData?.error&&<div style={{...S.card,color:C.red,fontSize:12,borderLeft:`3px solid ${C.red}`}}>{postMatchData.error}</div>}
          </div>
        )}

        {/* ── PATTERNS TAB ── */}
        {tab==="patterns"&&(
          <div style={S.sec}>
            <div style={S.secL}>Pattern Intelligence Database <span style={S.line}/><span style={pill(`${patterns.filter(p=>p.active).length} ACTIVE`,C.purple)}>{patterns.filter(p=>p.active).length} ACTIVE</span></div>
            {patterns.length===0
              ?<div style={{...S.card,color:C.muted,fontSize:12}}>No patterns yet. Run post-match intelligence scans after games to start building your pattern database.</div>
              :patterns.map(pattern=>(
                <div key={pattern.id} style={{...S.card,marginBottom:6,borderLeft:`3px solid ${pattern.active?(pattern.direction==="positive"?C.green:C.red):C.muted}`,opacity:pattern.active?1:0.5}}>
                  <div style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap",marginBottom:8}}>
                    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      <span style={pill(pattern.market,C.blue)}>{pattern.market}</span>
                      {pattern.context&&<span style={pill(pattern.context,C.amber)}>{pattern.context}</span>}
                      <span style={pill(pattern.direction==="positive"?"POSITIVE":"NEGATIVE",pattern.direction==="positive"?C.green:C.red)}>{pattern.direction}</span>
                      <span style={pill(`Strength: ${pattern.strength||10}`,C.muted)}>Strength: {pattern.strength||10}</span>
                    </div>
                    <button style={{...S.btnSm,color:pattern.active?C.red:C.green,borderColor:pattern.active?C.red:C.green,fontSize:8}} onClick={()=>togglePattern(pattern.id)}>
                      {pattern.active?"Deactivate":"Activate"}
                    </button>
                  </div>
                  <div style={{fontSize:13,color:C.text,marginBottom:4}}>{pattern.description}</div>
                  <div style={{fontSize:10,color:C.muted}}>Added: {pattern.addedDate} · {pattern.gamesTracked} game(s) tracked · Hit rate: {pattern.hitRate}%</div>
                </div>
              ))
            }
          </div>
        )}

        {/* ── INTELLIGENCE TAB ── */}
        {tab==="intelligence"&&(<>
          <div style={S.sec}>
            <div style={S.secL}>Performance Dashboard <span style={S.line}/></div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:3,marginBottom:16}}>
              {[{l:"BABs Tracked",v:stats.totalBabs,c:C.blue},{l:"BAB Win Rate",v:`${babWR}%`,c:babWR>=40?C.green:C.amber},{l:"Leg Hit Rate",v:`${legHR}%`,c:legHR>=55?C.green:C.amber},{l:"Total Staked",v:`£${stats.totalStake.toFixed(2)}`,c:C.muted},{l:"Total Return",v:`£${stats.totalReturn.toFixed(2)}`,c:C.muted},{l:"P&L",v:`${pnl>=0?"+":""}£${pnl.toFixed(2)}`,c:pnl>=0?C.green:C.red},{l:"Patterns",v:patterns.filter(p=>p.active).length,c:C.purple}].map(item=><div key={item.l} style={S.statB}><div style={S.statN(item.c)}>{item.v}</div><div style={S.statL}>{item.l}</div></div>)}
            </div>
          </div>
          {[{title:"Market Hit Rates",data:stats.marketHits},{title:"Context Win Rates",data:stats.contextHits},{title:"Referee Win Rates",data:stats.refereeHits}].map(({title,data})=>(
            <div key={title} style={S.sec}>
              <div style={S.secL}>{title} <span style={S.line}/></div>
              {Object.keys(data).length===0
                ?<div style={{...S.card,color:C.muted,fontSize:12}}>No data yet.</div>
                :Object.entries(data).sort((a,b)=>b[1].attempts-a[1].attempts).map(([k,v])=>{
                  const rate=Math.round((v.wins/v.attempts)*100);
                  return <div key={k} style={{...S.card,marginBottom:3}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                      <div><div style={{fontWeight:700}}>{k}</div><div style={{fontSize:10,color:C.muted}}>{v.wins}W / {v.attempts-v.wins}L from {v.attempts}</div></div>
                      <div style={{textAlign:"right"}}><div style={{fontSize:22,fontWeight:900,color:rate>=60?C.green:rate>=45?C.amber:C.red}}>{rate}%</div></div>
                    </div>
                    <div style={{height:4,background:`linear-gradient(90deg,${rate>=60?C.green:rate>=45?C.amber:C.red} ${rate}%,${C.dim} ${rate}%)`,marginTop:8}}/>
                  </div>;
                })
              }
            </div>
          ))}
        </>)}

        {/* ── RULES TAB ── */}
        {tab==="rules"&&(
          <div style={S.sec}>
            <div style={S.secL}>Hard Rules Database <span style={S.line}/></div>
            <div style={{fontSize:10,color:C.muted,marginBottom:12}}>17 rules built from real tracked BABs. R16-R17 are new Final Day rules.</div>
            {SEED_RULES.map(rule=>(
              <div key={rule.id} style={{...S.card,marginBottom:3,display:"flex",gap:14,flexWrap:"wrap"}}>
                <div style={{minWidth:36}}><span style={pill(rule.id,rule.verdict?.includes("AVOID")?C.red:rule.verdict==="STRONG BACK"?C.green:C.amber)}>{rule.id}</span></div>
                <div style={{flex:1}}><div style={{fontWeight:700,fontSize:13,marginBottom:4}}>{rule.label}</div><div style={{fontSize:11,color:"#888",lineHeight:1.7}}>{rule.detail}</div></div>
                <div><span style={pill(rule.verdict,rule.verdict?.includes("AVOID")?C.red:rule.verdict==="STRONG BACK"?C.green:C.amber)}>{rule.verdict}</span></div>
              </div>
            ))}
          </div>
        )}


          {/* ── WORLD CUP 2026 TAB ── */}
          {tab==="worldcup"&&(
            <div>
              <div style={{...S.card,borderLeft:`3px solid #FFD700`,marginBottom:8}}>
                <div style={{fontSize:9,letterSpacing:3,color:"#FFD700",textTransform:"uppercase",marginBottom:8}}>🌍 World Cup 2026 — Intelligence Module</div>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.8}}>Built from 5 World Cup datasets (2006–2022) · 340+ matches analysed · Separate rule engine from Premier League</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:14}}>
                  {[["Group Stage Goals/Game","2.54","2018 avg — highest in tournament"],["Knockout Goals/Game","2.19","2022 avg — drops 0.3–0.5"],["BTTS Group Stage","~65%","drops to ~55% knockouts"],["Over 2.5 Goals (GS)","~46%","only 34% in 2022 group stage"],["Yellow Cards/Game","3.34","2022 · 214 YC / 64 games"],["Corners/Game","~9.2","lower than PL — more direct play"],["2nd Half Goals","60%","teams push late — strong 2H markets"],["Fouls/Game","~23","higher than PL — physical battles"],["Game 1 avg goals","2.38","cautious openers — avoid Over 2.5"],["Game 2 avg goals","2.94","most goals — best round to back"],].map(([l,v,n],i)=>(
                    <div key={i} style={{background:"rgba(255,215,0,0.04)",border:`1px solid rgba(255,215,0,0.15)`,borderRadius:6,padding:"8px 10px"}}>
                      <div style={{fontSize:9,color:"#FFD700",letterSpacing:1,textTransform:"uppercase"}}>{l}</div>
                      <div style={{fontSize:18,fontWeight:700,color:C.text,margin:"3px 0"}}>{v}</div>
                      <div style={{fontSize:9,color:C.muted}}>{n}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{...S.card,marginBottom:8}}>
                <div style={{fontSize:9,letterSpacing:3,color:C.green,textTransform:"uppercase",marginBottom:10}}>All 12 Groups — 2026 World Cup</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
                  {[{g:"A",t:["Mexico","S.Korea","S.Africa","Czechia"]},{g:"B",t:["Canada","Switzerland","Qatar","Bosnia"]},{g:"C",t:["Brazil","Morocco","Haiti","Scotland"]},{g:"D",t:["USA","Paraguay","Australia","Turkey"]},{g:"E",t:["Germany","Ecuador","Ivory Coast","Curacao"]},{g:"F",t:["Netherlands","Japan","Sweden","Tunisia"]},{g:"G",t:["Belgium","Egypt","Iran","New Zealand"]},{g:"H",t:["Spain","Uruguay","Cape Verde","Saudi Arabia"]},{g:"I",t:["France","Senegal","Iraq","Norway"]},{g:"J",t:["Argentina","Algeria","Austria","Jordan"]},{g:"K",t:["Portugal","DR Congo","Uzbekistan","Colombia"]},{g:"L",t:["England","Croatia","Ghana","Panama"]}].map(({g,t})=>(
                    <div key={g} style={{background:"rgba(255,255,255,0.03)",borderRadius:6,padding:"7px 9px",border:`1px solid ${C.border}`}}>
                      <div style={{fontSize:10,color:C.amber,fontWeight:700,marginBottom:3}}>Group {g}</div>
                      {t.map(x=><div key={x} style={{fontSize:10,color:C.muted}}>{x}</div>)}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{...S.card,marginBottom:8}}>
                <div style={{fontSize:9,letterSpacing:3,color:"#FFD700",textTransform:"uppercase",marginBottom:12}}>🧠 World Cup Intelligence Rules — 2006–2022 Data</div>
                {[
                  {id:"WC1",v:"AVOID",c:C.red,t:"Game 1 — cautious openers, avoid Over 2.5",d:"Avg 2.38 goals/game in round 1 across 2010-2022. Teams play defensively in opener — fear losing first game. 50% of group stage game 1s ended goalless at HT. Only back Over 2.5 in game 1 when quality gap is massive (Top 8 vs minnow)."},
                  {id:"WC2",v:"BACK",c:C.green,t:"Game 2 — highest scoring round, back BTTS and Over 2.5",d:"2.94 goals/game average in round 2 — the highest of any group stage round across multiple WCs. Teams need points after game 1 results are known. Both teams attack freely. BTTS and Over 2.5 are strongest here."},
                  {id:"WC3",v:"CAUTION",c:C.amber,t:"Game 3 dead rubber — check qualification status first",d:"2.31 goals/game average in round 3. When teams are already through or already eliminated, motivation collapses. Always check who needs what before placing any market in the final group game."},
                  {id:"WC4",v:"AVOID",c:C.red,t:"Over 2.5 in knockouts — drops to 2.19 goals/game",d:"Group stage avg: 2.72 goals/game (2022). Knockout avg: 2.19. BTTS drops from 65% to 55%. Under 2.5 becomes value from QF onwards. Elimination pressure = defensive caution. Confirmed across every WC since 1998."},
                  {id:"WC5",v:"AVOID",c:C.red,t:"Short-price favourites — World Cup upsets are endemic",d:"Germany 1/4 lost to Mexico (2018). Argentina 1/8 lost to Saudi Arabia (2022). Spain 2/5 lost to Switzerland (2022 R16). Top nations underperform at 25%+ rate in group stage. Never back top team at odds shorter than 4/7 without serious research."},
                  {id:"WC6",v:"BACK",c:C.green,t:"Top 8 nation vs minnow — Over 2.5 and Over 3.5 viable",d:"France, Brazil, England, Germany, Spain, Argentina, Portugal, Netherlands vs Group C/D tier teams average 3.2 goals/game historically. 2018: England 6-1 Panama, Belgium 5-2 Tunisia, Germany 4-0 possible. Back Over 2.5 and consider Over 3.5."},
                  {id:"WC7",v:"AVOID",c:C.red,t:"Player fouls committed — international stats unreliable",d:"Club fouls data does NOT transfer to international football. Players self-regulate to avoid WC yellow card accumulations which ban them from key games. Never use a player's club fouls rate to back WC fouls markets — it's a completely different environment."},
                  {id:"WC8",v:"CAUTION",c:C.amber,t:"Cards market — referee confederation matters massively",d:"2006 WC: 5.8 cards/game. 2022 WC: 3.34 cards/game. CONMEBOL and European refs card more. Asian and CONCACAF refs less. The ref appointment dramatically changes the cards market. Research referee origin before any cards market."},
                  {id:"WC9",v:"BACK",c:C.green,t:"BTTS group stage — 65% hit rate across 2010-2022",d:"BTTS landed in approximately 65% of all group stage games across the last 4 World Cups. Mixed-quality groups, teams all needing to score, and attacking football from motivated nations. The single most reliable World Cup group stage market."},
                  {id:"WC10",v:"BACK",c:C.green,t:"Second half goals — 60% of all WC goals scored after HT",d:"2022 WC: 60% of goals in 2nd half. Teams tire, chase the game, or open up late. Over 0.5 2nd Half Goals has historically been a 80%+ hit rate at World Cups. Strong addition to any BAB as a low-threshold, high-confidence leg."},
                  {id:"WC11",v:"BACK",c:C.green,t:"Host nation advantage — USA, Mexico, Canada in 2026",d:"Host nations beat expected odds in 70%+ of group stage games historically. In 2026, all three hosts benefit from home crowd, zero travel, and local knowledge. Mexico at Azteca is historically incredibly strong. Back hosts in close group games."},
                  {id:"WC12",v:"CAUTION",c:C.amber,t:"European teams game 1 away from home — underperform",d:"European sides travelling to non-European WCs consistently underperform in game 1 due to heat, travel fatigue, and acclimatisation. England have particularly poor game 1 records (vs USA 1-1 2010, vs Italy 1-2 2014). Factor North American summer heat for 2026."},
                  {id:"WC13",v:"BACK",c:C.green,t:"VAR = more penalties — back penalty-winning attackers",d:"2018 was first WC with VAR: 29 penalties — 61% increase on previous record. 2022 continued high rate. Players like Mbappe, Vinicius Jr, and Neymar who win penalties regularly are excellent fouls won / anytime scorer targets at WCs."},
                  {id:"WC14",v:"AVOID",c:C.red,t:"Corners Under markets — WC averages 9.2/game not 10+",d:"World Cup corners average ~9.2/game vs PL average of 10+. International teams play more direct, less possession football. Avoid Over 9.5 or Over 10.5 corners unless both teams are possession-dominant (Spain, Germany, Brazil)."},
                  {id:"WC15",v:"BACK",c:C.green,t:"Norway / Haaland — elite striker vs weaker opponents",d:"Group I: France, Senegal, Iraq, Norway. Norway's games vs Iraq = Haaland on the biggest stage motivated to prove himself. Player shots and SOT markets for Haaland vs weaker opposition are among the tournament's standout BAB legs."},
                  {id:"WC16",v:"AVOID",c:C.red,t:"Penalty shootouts — pure 50/50, never back them",d:"Penalty shootouts at World Cups are genuinely 50/50 regardless of team quality. England have lost 5 of 7 WC shootouts including against lower-ranked opposition. Never base a BAB on a shootout outcome — it destroys edge and adds pure luck variance."},
                  {id:"WC17",v:"CAUTION",c:C.amber,t:"Group 3rd place — 8 qualify in 2026 format",d:"NEW in 2026: The 8 best 3rd-place teams qualify for Round of 32. This means teams can afford to lose game 1 and still qualify. Watch for reduced urgency in game 3 when teams are on 3 points — dead rubber risk applies even to teams on 3 points if 3rd is safe."},
                  {id:"WC18",v:"BACK",c:C.green,t:"England vs Ghana/Panama — strong Over 2.5 and BTTS",d:"Group L: England vs Ghana (June 12, Boston) and England vs Panama are the ideal Over 2.5 backing games. England need points, both opponents are beatable, and England have strong attacking depth. Three Lions game 2 (once they know game 1 result) is the strongest legs."},
                  {id:"WC19",v:"BACK",c:C.green,t:"Brazil/France/Germany game 2 vs weakest group team",d:"Game 2 for the top nations vs their weakest group opponent historically produces the most goals at the WC. These teams know they need to build GD, have proven attacking intent in game 1, and face the group's weakest side. Prime Over 3.5 territory."},
                  {id:"WC20",v:"CAUTION",c:C.amber,t:"Late group game timing collusion risk",d:"When two teams both need the same result in game 3 to qualify (e.g. both need a draw), historical collusion has occurred (1982 West Germany vs Austria, 1998 Iran vs USA). Avoid backing competitive markets in game 3 when the arithmetic incentivises both teams to draw."},
                ].map(r=>(
                  <div key={r.id} style={{borderLeft:`3px solid ${r.c}`,paddingLeft:12,marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${C.border}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                      <div style={{fontSize:11,fontWeight:700,color:C.text}}>{r.id} — {r.t}</div>
                      <span style={{fontSize:9,color:r.c,letterSpacing:2,fontWeight:700,minWidth:50,textAlign:"right"}}>{r.v}</span>
                    </div>
                    <div style={{fontSize:11,color:C.muted,lineHeight:1.7}}>{r.d}</div>
                  </div>
                ))}
              </div>

              <div style={{...S.card,background:"rgba(255,215,0,0.04)",border:`1px solid rgba(255,215,0,0.3)`}}>
                <div style={{fontSize:11,color:"#FFD700",fontWeight:700,marginBottom:6}}>🚧 Full World Cup Analyser — Deploying This Week</div>
                <div style={{fontSize:11,color:C.muted,lineHeight:1.8}}>Full fixture-by-fixture BAB analyser with WC-specific rules, live team news, referee confederation data, and group stage context tracking. Tournament opens June 11 vs Mexico vs South Africa at Azteca.</div>
              </div>
            </div>
          )}

        <div style={{textAlign:"center",padding:"32px 0 16px",borderTop:`1px solid ${C.border}`,marginTop:24}}>
          <div style={{fontSize:9,color:"#2a2a35",letterSpacing:3}}>THEBABLAB v5 · COMPLETE SYSTEM · BEGAMBLEAWARE.ORG · 18+ · PLEASE GAMBLE RESPONSIBLY</div>
        </div>
      </div>
    </div>
  );
}
