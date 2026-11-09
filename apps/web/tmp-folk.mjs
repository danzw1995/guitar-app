import { READING_DRILLS, SONG_SNIPPETS, tabToAlphaTex } from "@guitar/core";
const s = SONG_SNIPPETS.find((x) => x.id === "sn-folk");
console.log(tabToAlphaTex(s.tab, { bpm: 70 }));
