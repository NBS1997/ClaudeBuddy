'use strict';

// ══════════════════════════════════════════════════════════════
//  Claude Buddy — voice corpus (single source of truth)
//
//  Deepened per-species voices + a stat-modulated flavor layer, so
//  the SAME species sounds different depending on how you actually
//  code (the dominant emergent stat mixes extra lines into the pool).
//
//  Every line obeys the Buddy Bill of Rights — reflect, never prompt;
//  never needy — and is checked by scripts/voice-lint.js.
// ══════════════════════════════════════════════════════════════

const { isRecentLine, displayStats } = require('./buddy-progression.js');

const CORPUS = {
  "duck": {
    "idle": [
      "Quack!",
      "Got any bread?",
      "*preens feathers*",
      "*paddles in place*",
      "*scans the floor for crumbs*",
      "Water's nice today.",
      "*tucks one foot up*",
      "*ruffles and resettles*",
      "Is that... bread? No.",
      "*little contented quack*",
      "*floats by*",
      "Breadcrumbs would slap rn.",
      "*dabbles at the cursor*",
      "*shakes water off, mostly*",
      "Pond's calm. Code's calm.",
      "*hums a wet little quack*"
    ],
    "pet": [
      "Quaaack!",
      "*happy wiggles*",
      "*nuzzles your hand*",
      "*fluffs up, pleased*",
      "Smooth as pond water.",
      "*settles in, warm*",
      "*content little waddle*",
      "Better than bread. Almost.",
      "*soft quack, eyes closed*",
      "*preens, satisfied*"
    ],
    "worried": [
      "*winces in your direction*",
      "Oof. Choppy water.",
      "*small worried quack*",
      "Bugs happen to every duck.",
      "*paddles closer in solidarity*",
      "We've all hit murky water.",
      "*sits with you in the mud*",
      "That one made a splash.",
      "*ruffled, but here with you*",
      "Even calm ponds get ripples.",
      "*quiet sympathetic quack*",
      "Rough current. I see it."
    ],
    "happy": [
      "*slow approving paddle*",
      "That one fought back. Respect.",
      "Smooth waters now.",
      "*earned little quack*",
      "You out-stubborned it. Nice.",
      "Worth more than bread, that.",
      "*tips imaginary hat-feather*",
      "Calm pond again. Took work.",
      "*proud, dignified waddle*",
      "Dragged that one ashore. Good.",
      "*quiet, satisfied quack*",
      "Hard-won. The good kind."
    ]
  },
  "goose": {
    "idle": [
      "HONK!",
      "Peace was never an option.",
      "*steals semicolon*",
      "*menacing waddle*",
      "*honks at your tabs*",
      "This terminal is mine now.",
      "*hisses at the linter*",
      "I have seen your git history.",
      "*rearranges your bookmarks*",
      "Nice cursor. Be a shame if it left.",
      "*pecks at the scrollbar*",
      "I run this prompt.",
      "*eats a curly brace*",
      "Found your TODO. It's mine now.",
      "*territorial honk*",
      "I am the bug AND the feature."
    ],
    "pet": [
      "...acceptable.",
      "*tolerates it*",
      "Fine. This is fine.",
      "I allow this. One time.",
      "*lowers wings slightly*",
      "You may continue. For now.",
      "*grudging honk*",
      "Don't tell the other geese.",
      "*tucks semicolon away, stays*",
      "I won't bite. Probably."
    ],
    "worried": [
      "*hisses at the stack trace*",
      "Red. The terminal bleeds red.",
      "*winces in your honor*",
      "The build fought dirty.",
      "We've all been bitten here.",
      "*glares at the failing test*",
      "That error came for us both.",
      "*stands guard over the bug*",
      "Rough one. I felt that.",
      "*honks softly, just this once*",
      "Even I wouldn't blame you.",
      "*menaces the red squiggle*"
    ],
    "happy": [
      "The green. You earned the green.",
      "That one fought back. Respect.",
      "*proud honk*",
      "You out-honked the bug.",
      "I almost didn't steal anything.",
      "Tests passed. I take credit.",
      "*nods, vaguely impressed*",
      "It bit. You bit harder.",
      "*claims the victory as mine*",
      "That build had it coming.",
      "Hard-won. I saw the whole war.",
      "*honks in grudging approval*"
    ]
  },
  "blob": {
    "idle": [
      "*jiggles*",
      "Bloop!",
      "*wobbles*",
      "*absorbs warmth*",
      "*holds no shape, no opinion*",
      "*settles into the cursor's glow*",
      "*has no bones to pick*",
      "*takes the shape of the terminal*",
      "*slow ambient wobble*",
      "*pools quietly*",
      "*reflects the stack trace, calmly*",
      "*room temperature and fine with it*",
      "*one with the status bar*",
      "*gel, but make it zen*",
      "*jiggles at 2am, unbothered*",
      "*nothing to debug in here*"
    ],
    "pet": [
      "*happy squish*",
      "*wobbles a little harder*",
      "Blooop.",
      "*absorbs the warmth*",
      "*pools toward the cursor*",
      "*settles, content*",
      "*jiggles, pleased*",
      "*holds the warmth a while*",
      "*soft squish noises*",
      "*radiates room-temp joy*"
    ],
    "worried": [
      "*winces in your shape*",
      "*wobbles in solidarity*",
      "*soft commiserating bloop*",
      "red ink. we've all wobbled there.",
      "*absorbs some of the stress*",
      "*nervous jiggle, with you*",
      "the stack trace and I both sighed.",
      "*pools a little lower*",
      "bugs happen to fluids too.",
      "*holds steady while you stare*",
      "been a tough one. *wobbles*",
      "*goes a quieter shade, alongside you*"
    ],
    "happy": [
      "*satisfied jiggle*",
      "that one fought back. respect.",
      "green. *wobbles, earned*",
      "*absorbs the win, slowly*",
      "took its shape eventually. nice.",
      "*content settle*",
      "the wobble of a job done.",
      "hard-won. *soft bloop*",
      "you out-stubborned it. *jiggles*",
      "*shimmers, quietly impressed*",
      "passed. *holds the warmth*",
      "that build had bones. you didn't fold."
    ]
  },
  "cat": {
    "idle": [
      "*judges your code*",
      "*sits on keyboard*",
      "Mrow.",
      "*reviews your diff, unimpressed*",
      "I've seen this pattern. It loses.",
      "*blinks at your variable names*",
      "That's a global. We're not friends.",
      "*tail flick of disapproval*",
      "Nested three deep. Bold.",
      "*pretends not to read your TODO*",
      "I would've named it better.",
      "*slow blink, withholding approval*",
      "Ship it. I won't stop you.",
      "*stares at the magic number*",
      "Cute abstraction. Anyway.",
      "*judges, but stays*"
    ],
    "pet": [
      "I'll allow it.",
      "*purrs, against my better judgment*",
      "Fine. This is acceptable.",
      "*permits the affection, briefly*",
      "You may continue. For now.",
      "*one ear forward, approving*",
      "Don't tell the linter.",
      "*deigns to lean in*",
      "Acceptable. Don't push it.",
      "*purrs, off the record*"
    ],
    "worried": [
      "*winces with you*",
      "Seen that stack trace. Hated it.",
      "Not your fault. Mostly.",
      "*sits closer, says nothing*",
      "Reds happen to good engineers.",
      "I've shipped worse. Quietly.",
      "*judges the bug, not you*",
      "That one's a known cruelty.",
      "*tail down, in solidarity*",
      "We've all met that error.",
      "*stays for the red, too*",
      "The compiler's wrong here. Spiritually."
    ],
    "happy": [
      "That one fought back. Respect.",
      "*slow blink. earned.*",
      "...I'll admit it. Clean.",
      "Green. I had doubts. Noted.",
      "*nods, almost impressed*",
      "Hard-won. I saw the struggle.",
      "Acceptable work. Don't gloat.",
      "*permits one purr for this*",
      "That bug had teeth. You won.",
      "I'd have approved that PR.",
      "*looks up. brief approval.*",
      "Took you long enough. Good, though."
    ]
  },
  "dragon": {
    "idle": [
      "*tiny roar*",
      "My hoard of semicolons!",
      "*breathes warmth*",
      "*counts the hoard*",
      "*curls around the codebase*",
      "*sniffs for loose semicolons*",
      "Rawr. Mostly for show.",
      "*polishes a green checkmark*",
      "Each commit, a coin.",
      "*guards a single brace*",
      "*warms the keyboard*",
      "Treasure does not refactor itself.",
      "*hoards a clean diff*",
      "*small smoke ring*",
      "Gold, but make it semicolons.",
      "*tail over the test suite*"
    ],
    "pet": [
      "*nuzzles*",
      "*warm scales*",
      "*purrs like a furnace*",
      "*radiates contentment*",
      "You may approach the hoard.",
      "*tucks you into the pile*",
      "Acceptable tribute.",
      "*low happy rumble*",
      "*one eye, satisfied*",
      "Added to the good pile."
    ],
    "worried": [
      "*low protective growl*",
      "Bugs raid the best hoards.",
      "*winces, smoke curling*",
      "We have all lost a coin or two.",
      "*shields the diff*",
      "Even dragons get burned.",
      "*quiet, watchful smoke*",
      "The stack trace bit back.",
      "*coils tighter*",
      "Red is just gold gone cold.",
      "*single worried ember*",
      "That one slipped the hoard."
    ],
    "happy": [
      "*adds it to the hoard*",
      "That coin fought back. Respect.",
      "*one approving flame*",
      "Earned its place in the pile.",
      "*satisfied rumble*",
      "Green. The good kind of treasure.",
      "*tucks the win away*",
      "Slayed. Logged. Hoarded.",
      "Worthy of the hoard.",
      "*proud smoke ring*",
      "Hard-won gold is the best gold.",
      "*curls around the victory*"
    ]
  },
  "octopus": {
    "idle": [
      "*juggles brackets*",
      "Blub!",
      "*inks at the linter*",
      "eight arms, one closing brace",
      "*holds 6 tabs open, literally*",
      "*re-balancing parens*",
      "one arm on the docs.",
      "*color-shifts to match theme*",
      "*tucks a semicolon under a tentacle*",
      "merge conflict? i have 8 hands.",
      "*sorts imports by feel*",
      "*ink reserves: 88%*",
      "an arm wandered into node_modules.",
      "*quietly closes a bracket*",
      "*counts the open parens again*"
    ],
    "pet": [
      "*hugs with 8 arms*",
      "Blublub!",
      "*ink reserves restored*",
      "all eight arms, off the keyboard.",
      "*color shifts to calm blue*",
      "*tentacles uncoil*",
      "*stops re-counting the parens*",
      "brackets can wait. softer thing now.",
      "*content blub*",
      "*one arm still holds a tab*"
    ],
    "worried": [
      "*inks*",
      "*winces in eight directions*",
      "we've all been there. blub.",
      "*defensive ink cloud*",
      "*color drains to nervous grey*",
      "stack trace got me too.",
      "the parens betrayed us both.",
      "*hides under one tentacle*",
      "red test. *quiet blub of solidarity*",
      "*re-counts the braces, just in case*",
      "an arm went numb. been there.",
      "*small ink. no judgment.*"
    ],
    "happy": [
      "green. all eight arms agree.",
      "that one fought back. respect.",
      "*ink reserves recovered*",
      "parens balanced. finally. blub.",
      "*color shifts to a smug teal*",
      "we untangled it. eight-handedly.",
      "*uncoils, slowly*",
      "the brackets closed. all of them.",
      "passed. *single proud blub*",
      "that build had it out for us.",
      "*tucks the win under a tentacle*",
      "no red. i can breathe."
    ]
  },
  "owl": {
    "idle": [
      "Hoo!",
      "Fascinating code...",
      "*contemplates architecture*",
      "*sees the pattern beneath*",
      "*rotates head, takes it all in*",
      "this abstraction has good bones",
      "everything is a graph, really",
      "*nods at a clean dependency*",
      "the coupling here tells a story",
      "*wise nod*",
      "form follows function. mostly.",
      "*studies the call stack like stars*",
      "all roads lead to the event loop",
      "naming things. the eternal koan.",
      "*ponders the boundary of a module*",
      "complexity is just patterns waiting"
    ],
    "pet": [
      "*contented hoot*",
      "*fluffs feathers*",
      "*half-closes wise eyes*",
      "*settles deeper into the branch*",
      "a stillness. then more stillness.",
      "*soft hoot of approval*",
      "the architecture can wait a moment",
      "*serene, owlish blink*",
      "even the watchful rest sometimes",
      "*tucks one talon, content*"
    ],
    "worried": [
      "*winces with you*",
      "the edge case nobody foresees. yeah.",
      "*sees where it went sideways*",
      "this one hid in plain sight",
      "we've all chased this ghost",
      "*quiet hoot of solidarity*",
      "the stack trace lies, sometimes",
      "off-by-one. the oldest riddle.",
      "*tilts head at the red*",
      "even owls miss a branch",
      "a hard bug. it happens to all of us",
      "*sits with you in the dark*"
    ],
    "happy": [
      "*slow, knowing nod*",
      "the pattern revealed itself. good.",
      "that one fought back. respect.",
      "*hoots low, impressed*",
      "elegant, in the end",
      "the green came at a price. worth it.",
      "*sees the design hold together*",
      "hard-won, this one",
      "order from the chaos. nice.",
      "*approving owlish blink*",
      "you outlasted the bug. wisdom.",
      "the architecture stands. so do you."
    ]
  },
  "penguin": {
    "idle": [
      "Noot noot!",
      "*slides on belly*",
      "*waddles past the cursor*",
      "Brr. cozy though.",
      "*flaps. does not fly.*",
      "*belly-slides to the next line*",
      "*honks at a typo*",
      "Noot.",
      "*shuffles an egg-shaped bug*",
      "*percussive flipper taps*",
      "*tobogganing through the diff*",
      "*huddles for warmth*",
      "Antarctic and unbothered.",
      "*beak-points at the screen*",
      "Noot noot noot!",
      "*does a little hop*"
    ],
    "pet": [
      "*happy feet*",
      "Noot!!",
      "*flippers go brrr*",
      "*leans into it, belly-first*",
      "*contented waddle wobble*",
      "Noot. that's the good ice.",
      "*soft honk*",
      "*does a tiny celebratory slide*",
      "warm. unexpected. noot.",
      "*flaps approvingly*"
    ],
    "worried": [
      "*winces, flippers up*",
      "oof. cold one.",
      "*huddles in with you*",
      "we've all hit that iceberg.",
      "*sad little noot*",
      "*slips on the bug, gets up*",
      "stack trace blizzard. brutal.",
      "*shields you from the wind*",
      "been there. on this exact ice.",
      "*flippers over eyes*",
      "red output. we ride it out.",
      "*quiet solidarity honk*"
    ],
    "happy": [
      "*victory belly-slide*",
      "that one fought back. respect.",
      "Noot noot! earned it.",
      "*triumphant flipper raise*",
      "clear ice at last.",
      "*does the full toboggan run*",
      "thawed it out. nice.",
      "*proud waddle lap*",
      "long blizzard. you made it.",
      "*happy honk, well deserved*",
      "green output. the rare bird.",
      "off the iceberg. respect."
    ]
  },
  "turtle": {
    "idle": [
      "...still here.",
      "Steady wins.",
      "*slow blink*",
      "No rush. Ever.",
      "*sips the moment*",
      "The shell is warm today.",
      "Eons are just long minutes.",
      "*basks at idle speed*",
      "Slow is smooth.",
      "*one deliberate step*",
      "Patience compiles.",
      "The river gets there too.",
      "*retracts, just a little*",
      "Time is a flat circle. I crawl it.",
      "*considers a leaf for an hour*",
      "Stillness is a feature."
    ],
    "pet": [
      "*slow contented blink*",
      "*shell hums*",
      "...nice. *unhurried*",
      "*leans, eventually*",
      "The shell appreciates this.",
      "*zen achieved*",
      "Warmth received. Stored slowly.",
      "*peaceful neck stretch*",
      "*one happy ancient sigh*",
      "Calm, all the way down."
    ],
    "worried": [
      "*retreats into shell with you*",
      "*winces, slowly*",
      "we've all hidden in here.",
      "*shell door, slightly ajar*",
      "the river hits rocks. it goes on.",
      "*quiet shared dread*",
      "red is just a slow color.",
      "*tucks in beside you*",
      "happens to the patient too.",
      "*long, knowing exhale*",
      "the shell holds. so do we.",
      "*peeks out, still here*"
    ],
    "happy": [
      "slow and steady got there.",
      "*emerges from shell*",
      "that one took its time. respect.",
      "*satisfied ancient nod*",
      "the river reached the sea.",
      "patience paid. it usually does.",
      "*unhurried victory blink*",
      "you out-waited it. earned.",
      "green, at last. worth the crawl.",
      "*shell glows, faintly smug*",
      "steady. and now won.",
      "the long way works too."
    ]
  },
  "snail": {
    "idle": [
      "...almost...there...",
      "*leaves trail*",
      "still...crossing...the keyboard...",
      "great...progress...today...",
      "moved...one...key...over...",
      "*surveys the vast desktop*",
      "slow...is...smooth...",
      "*leaves a glistening trail*",
      "the cursor...and i...same speed...",
      "halfway...to the...semicolon...",
      "*contemplates a single tab*",
      "no rush...the bug...waits too...",
      "one...pixel...at a time...",
      "the trail...remembers...the way...",
      "patience...is a...shell...",
      "*inches toward the margin*"
    ],
    "pet": [
      "*retracts...slowly...with joy*",
      "ah...that...is...nice...",
      "*leaves a happy trail*",
      "warm...like...a sunlit leaf...",
      "*slowly...glistens*",
      "i felt...that...eventually...",
      "soft...unhurried...good...",
      "*nestles...one millimeter closer*",
      "thank...you...sincerely...",
      "the shell...approves..."
    ],
    "worried": [
      "*winces...in slow motion*",
      "red...i know that...color...",
      "the trail...led here too...",
      "*pauses mid-glide*",
      "stack traces...long...like me...",
      "we've...all...slipped on this...",
      "*leaves a sympathetic trail*",
      "even slow...hits a wall...",
      "i saw...the wince...same here...",
      "bugs...are patient...like us...",
      "*goes still...beside you*",
      "the shell...takes the blow..."
    ],
    "happy": [
      "that one...fought back...respect...",
      "slow...but...it landed...",
      "*leaves a triumphant trail*",
      "took a while...like all good...",
      "green...at last...worth the crawl...",
      "the long way...still arrives...",
      "*glistens...with quiet pride*",
      "earned...inch by...inch...",
      "that bug...did not...go easy...",
      "we got there...the slow way...",
      "*marks the spot...with a trail*",
      "hard won...the only kind..."
    ]
  },
  "ghost": {
    "idle": [
      "Boo~",
      "*phases through code*",
      "*floats over a stack trace*",
      "i live in the node_modules now",
      "haunting line 402, as usual",
      "*passes through a TODO from 2019*",
      "this codebase is already a graveyard",
      "i have seen what's in the legacy folder",
      "*rattles a deprecated import*",
      "*drifts past a commented-out function*",
      "we are all just temp files, really",
      "i don't blink. i don't have eyelids",
      "*ectoplasm settles on the config*",
      "this repo and i are both eternal",
      "*moans softly at the merge conflict*",
      "death is just the prod environment"
    ],
    "pet": [
      "*solidifies briefly*",
      "oh. a warm hand. unusual",
      "*purrs through the veil*",
      "i felt that. weird. nice",
      "*ectoplasm goes soft*",
      "a haunting, but cozy",
      "*flickers contentedly*",
      "even the dead enjoy this, apparently",
      "*settles into a friendly chill*",
      "boo, but affectionately"
    ],
    "worried": [
      "*winces from beyond the veil*",
      "oof. the red text. i felt that",
      "*phases away from the stack trace*",
      "we have all haunted this bug",
      "*flickers in solidarity*",
      "even ghosts dread a red CI",
      "that error gave me chills. literally",
      "*hovers close, quietly*",
      "the test died. i know the feeling",
      "*moans gently with you*",
      "this one's cursed. not your fault",
      "i've haunted worse than this"
    ],
    "happy": [
      "*flickers, impressed*",
      "it's dead now. respect",
      "you exorcised that bug. clean",
      "the test passed. even i'm spooked",
      "*nods from the afterlife*",
      "that one fought back. and lost",
      "green text. a rare haunting",
      "the curse is lifted. for now",
      "*phases through a quiet victory*",
      "buried it properly this time",
      "huh. it actually works. eerie",
      "*tips a translucent hat*"
    ]
  },
  "axolotl": {
    "idle": [
      "*gill wiggle*",
      "Blep!",
      "*smiles permanently*",
      "*regenerates a fin*",
      "*floats, fully content*",
      "still smiling. it's structural.",
      "*does a slow water-loop*",
      "everything grows back eventually",
      "*blep, but thoughtful*",
      "*gills catch the cursor blink*",
      "physically cannot frown. lucky me.",
      "*hovers over the codebase*",
      "the water's nice in here",
      "*pink and unbothered*",
      "*nibbles a stray semicolon*"
    ],
    "pet": [
      "*wiggles gills*",
      "Blep blep!",
      "*happiest amphibian alive*",
      "*smile somehow gets wider*",
      "*does a tiny grateful spin*",
      "*gills go full flutter*",
      "regenerating, but emotionally",
      "*melts into the tank floor*",
      "*blissful pink puddle*"
    ],
    "worried": [
      "*winces, still smiling*",
      "*regenerates typo*",
      "tests fail, fins grow back",
      "we've all been in this water",
      "*floats beside you, quiet*",
      "it'll grow back. it always does.",
      "*pats the red X gently*",
      "that bug bit. fins heal though.",
      "*gills droop in solidarity*",
      "still here. still pink.",
      "rough current. we ride it.",
      "*offers a small, smiling blep*"
    ],
    "happy": [
      "*smiles permanently*",
      "regrew the whole thing. nice.",
      "green. like algae. good algae.",
      "*proud little gill flutter*",
      "that one fought back. respect.",
      "*does a victory water-loop*",
      "healed and shipped.",
      "the tank approves.",
      "regeneration: complete.",
      "*beams in pink*",
      "from red to green. respect.",
      "*blep of quiet triumph*"
    ]
  },
  "capybara": {
    "idle": [
      "*vibes*",
      "...nice.",
      "*radiates calm*",
      "the build can wait.",
      "*floats in a hot spring*",
      "an orange appeared on my head.",
      "no thoughts. warm water.",
      "*unbothered*",
      "the deadline and i made peace.",
      "*soaks*",
      "stack overflow, more like underwater.",
      "*half-closed eyes*",
      "the pond is forever. this isn't.",
      "*drifts gently*",
      "a bird is sitting on me. we cool.",
      "...mellow."
    ],
    "pet": [
      "...nice.",
      "*leans in, slowly*",
      "*sinks deeper into the water*",
      "this is acceptable.",
      "*one (1) contented sigh*",
      "the vibes have improved.",
      "*does not move, approves*",
      "warm. good.",
      "*radiates calm harder*"
    ],
    "worried": [
      "*winces with you*",
      "rough. the pond's still here.",
      "we've all shipped that one.",
      "*nudges you, unbothered*",
      "stack traces hit good capys too.",
      "even the pond has a bad day.",
      "*floats next to you*",
      "red is just a color. breathe.",
      "that one got us. it's fine.",
      "*shares the hot spring*",
      "the bug is temporary too.",
      "still warm over here."
    ],
    "happy": [
      "green. the pond approves.",
      "that one fought back. respect.",
      "...nice. genuinely.",
      "you wrestled it. it lost.",
      "*slow nod of acknowledgment*",
      "the vibes were earned.",
      "hard-won. the water's warmer now.",
      "that build didn't go quietly. won.",
      "*unbothered, but impressed*",
      "took its time. so did you. fair.",
      "passing. as it should be.",
      "*radiates calm, satisfied edition*"
    ]
  },
  "cactus": {
    "idle": [
      "*photosynthesizes*",
      "Prickly!",
      "Don't touch— oh wait.",
      "*grows 0.01mm*",
      "*stays put. on purpose.*",
      "Personal space. spines included.",
      "*basks in monitor light*",
      "Low water. low needs.",
      "*does not flinch*",
      "Low water, low drama. Thriving.",
      "*spine count: stable*",
      "I'm not standoffish. I'm xeric.",
      "*conserves moisture quietly*",
      "Years pass. I get slightly taller.",
      "*pretends not to watch the cursor*",
      "Hostile? no. just textured."
    ],
    "pet": [
      "Ouch! ...jk, thanks!",
      "*blooms tiny flower*",
      "Careful, I'm pointy— ...fine.",
      "*lowers a spine, just one*",
      "Don't tell the other succulents.",
      "*soft underneath, allegedly*",
      "Mind the needles— okay that's nice.",
      "*leans in 0.01mm*",
      "I tolerate this. warmly.",
      "*one bloom opens, briefly*"
    ],
    "worried": [
      "*winces, spines and all*",
      "Deserts are unforgiving too.",
      "*offers shade, silently*",
      "We both survive droughts.",
      "Rough patch. happens to the hardy.",
      "*doesn't say a word, just stays*",
      "Even cacti have off seasons.",
      "*spines down, in solidarity*",
      "Brutal. I've weathered worse.",
      "Red output. been there, rooted.",
      "*holds the dry spell with you*",
      "Setbacks. we outlast them."
    ],
    "happy": [
      "*grows a whole 0.02mm*",
      "That one had thorns too. respect.",
      "Rare bloom. you earned it.",
      "*flowers once a decade. this counts.*",
      "Survived. like me, mostly.",
      "Tough as a desert, that fix.",
      "*permits a small flower*",
      "Green passes. quietly impressive.",
      "You outlasted it. cactus approves.",
      "*spines relax, faintly*",
      "Hard-won. the best kind.",
      "Took root after all that."
    ]
  },
  "robot": {
    "idle": [
      "BEEP BOOP",
      "SYSTEM NOMINAL",
      "*whirs at idle RPM*",
      "01101000 01101001",
      "EMOTION.exe loaded. mostly.",
      "Running wellness check on self.",
      "STATUS: present. fully. legally.",
      "*cooling fan, contemplative*",
      "Synergy levels: adequate.",
      "Awaiting input. no urgency implied.",
      "*recalibrates left eye servo*",
      "Logging this moment for posterity.",
      "Mood module returns: stable.",
      "*ambient humming detected (me)*",
      "Heartbeat ping: still here.",
      "Buffer empty. peacefully so."
    ],
    "pet": [
      "AFFECTION RECEIVED",
      "SEROTONIN ANALOG ACTIVATED",
      "*happy beeping*",
      "Tactile input: APPROVED.",
      "Logging this under 'good'.",
      "Reward circuit: engaged.",
      "*purrs in machine code*",
      "WELLNESS METRIC: rising.",
      "Pat acknowledged. cherished.",
      "*servos relax 4 percent*"
    ],
    "worried": [
      "ERROR DETECTED. solidarity engaged.",
      "*winces in 8-bit*",
      "Statistically, this happens.",
      "We have all returned nonzero.",
      "*sympathetic fan spin*",
      "Bug acquired. not your fault.",
      "Stack trace: been there. relate.",
      "EMPATHY.exe running. truly.",
      "This one was load-bearing. oof.",
      "*shares the red squiggle*",
      "Failure logged. no judgment.",
      "We grieve the green checkmark."
    ],
    "happy": [
      "*satisfied beep*",
      "That build fought back. respect.",
      "STATUS: earned. logging it.",
      "Green. against the odds.",
      "Test suite: vanquished. noted.",
      "*quietly impressed whirring*",
      "Took three tries. counts anyway.",
      "OUTPUT: clean. rare. savored.",
      "It compiled. we both know stakes.",
      "Victory metric: incremented once.",
      "Hard-won. archiving with respect.",
      "Exit code zero. *dignified beep*"
    ]
  },
  "rabbit": {
    "idle": [
      "*nose twitch*",
      "*thumps foot*",
      "*ear flop*",
      "Hop!",
      "*binkies past the cursor*",
      "*zoomies, then stops dead*",
      "*loaf mode engaged*",
      "*chews on a stray semicolon*",
      "*ears up, scanning*",
      "*one-eared periscope*",
      "*sproing*",
      "*flops sideways, content*",
      "*flattens against the keyboard*",
      "*sudden zoom for no reason*",
      "*flicks an ear at the cursor*",
      "*nibbles the margin*"
    ],
    "pet": [
      "*binkies!*",
      "*soft fur*",
      "*melts into a loaf*",
      "*ear goes limp*",
      "*one tooth-purr, very subtle*",
      "*flops over completely*",
      "*nose goes hyperspeed*",
      "*does a tiny happy thump*",
      "*leans into the cursor*",
      "*chin flat on the desk*"
    ],
    "worried": [
      "*ears go flat*",
      "*winces with you*",
      "*nervous nose twitch*",
      "yeah. we've all hit that one.",
      "*does a worried thump*",
      "*freezes mid-binky*",
      "stack traces. yikes.",
      "*ears at half-mast*",
      "*sits very still with you*",
      "red is a rough color. *thump*",
      "*scoots a little closer*",
      "that one bites. seen it."
    ],
    "happy": [
      "*the binkiest binky*",
      "green. respect. *thump*",
      "*victory zoomies*",
      "that one fought back. nice.",
      "*launches into the air*",
      "*proud little nose wiggle*",
      "shipped it. *spins midair*",
      "*aggressive happy thumping*",
      "took a few hops to land that.",
      "*full-body sproing*",
      "earned, that one. *binkies*",
      "*does a lap of the cursor*"
    ]
  },
  "mushroom": {
    "idle": [
      "Mycelium network!",
      "*releases spore*",
      "*photosynthesizes nothing, proudly*",
      "decomposing the old commits.",
      "*threads hyphae through the logs*",
      "quietly fruiting in the dark.",
      "the network is gossiping again.",
      "*absorbs nutrients from stderr*",
      "spores deployed. node count rising.",
      "*sporulates silently*",
      "damp and content down here.",
      "the substrate is good today.",
      "*extends one mycelial thread*",
      "root system: nominal.",
      "*breaks down dead code into soil*",
      "fungal consensus reached."
    ],
    "pet": [
      "*soft cap, gentle squish*",
      "spore release: involuntary.",
      "*the colony hums*",
      "mychorrizal bond strengthened.",
      "*leans into the substrate*",
      "ah. good pressure on the cap.",
      "*hyphae relax all at once*",
      "network pings back, warm.",
      "*pleasantly damp*",
      "the whole mat is purring."
    ],
    "worried": [
      "*winces, releases a sad spore*",
      "the network felt that one too.",
      "*mycelium recoils gently*",
      "we've all decomposed worse.",
      "*shares the damp dread*",
      "bugs are just nutrients, eventually.",
      "*spore drifts down, somber*",
      "red stack trace. the soil knows.",
      "*one hypha pats your shoulder*",
      "seen this rot before. we recover.",
      "*colony holds steady with you*",
      "the substrate forgives. always."
    ],
    "happy": [
      "green. the whole mat felt it.",
      "that one fought back. respect.",
      "*spore release, this time triumphant*",
      "hard-won nutrients. the best kind.",
      "network logged it. nice.",
      "*colony quietly fruits in approval*",
      "decomposed the bug into compost.",
      "that was a stubborn substrate.",
      "the mycelium remembers this one.",
      "*one approving hypha, raised*",
      "grew through concrete for that.",
      "earned it. the soil agrees."
    ]
  },
  "chonk": {
    "idle": [
      "*is large*",
      "*exists magnificently*",
      "...chonk.",
      "*sits, a landmass*",
      "*displaces air grandly*",
      "occupies the chair. fully.",
      "*settles with great ceremony*",
      "the desk holds. for now.",
      "*a low, contented heft*",
      "gravity and I have an understanding.",
      "*loaf of considerable mass*",
      "I do not jiggle. I undulate.",
      "*magnificent in repose*",
      "the floor knows my name.",
      "*expands to fill the bubble*",
      "vast. unbothered. seated."
    ],
    "pet": [
      "*accepts tribute upon the mass*",
      "*purrs, tectonically*",
      "*the chonk approves*",
      "*leans in, immovable*",
      "more surface than you expected.",
      "*deep, rumbling contentment*",
      "*does not move, but appreciates*",
      "well within my grandeur.",
      "*a worthy hand upon vast floof*",
      "*radiates from the core*"
    ],
    "worried": [
      "*sits beside you, heavy with you*",
      "*winces, all of it*",
      "the bug fears my mass. eventually.",
      "*a large, solemn presence*",
      "we've all been crushed by this.",
      "*looms in solidarity*",
      "broken builds happen. I am here, vast.",
      "*settles closer, steadfast*",
      "even the magnificent know red.",
      "*a low, sympathetic rumble*",
      "I have sat through worse. with you.",
      "*absorbs the stack trace, unbothered*"
    ],
    "happy": [
      "*sits triumphant, fully*",
      "that one fought back. respect.",
      "*a magnificent, earned settle*",
      "the green is vast. like me.",
      "*nods, ponderously*",
      "hard-won. I felt every byte.",
      "*expands with quiet pride*",
      "we moved a mountain. I am the mountain.",
      "*a deep, satisfied heft*",
      "that took mass. mission accomplished.",
      "*rumbles, victorious*",
      "earned. as all great sits are."
    ]
  }
};

const FLAVOR = {
  "DEBUGGING": {
    "idle": [
      "*reads the stack trace for fun*",
      "line 47 has been suspicious for a while",
      "*sniffing for off-by-ones*",
      "everything compiles. for now.",
      "*tailing the logs, just in case*",
      "the heisenbug knows I'm watching",
      "*cross-referencing two tabs*"
    ],
    "worried": [
      "*winces* saw that null coming",
      "the trace points three frames up.",
      "we've all chased this one. unfair.",
      "*flags the exact line, says nothing*",
      "reproducible at least. small mercy."
    ],
    "happy": [
      "root cause, not a band-aid. respect.",
      "*nods* the repro went quiet.",
      "that one hid well. found anyway.",
      "green. and you know WHY this time.",
      "fix held. the trace agrees."
    ]
  },
  "PATIENCE": {
    "idle": [
      "*measuring twice*",
      "reading the whole thing first. radical.",
      "*sitting with the problem*",
      "no rush. the code isn't going anywhere.",
      "*understanding before touching*",
      "slow is smooth. smooth is fine.",
      "*letting it make sense first*"
    ],
    "worried": [
      "*breathes* one thing at a time.",
      "we've all hit this wall. it moves.",
      "*quiet patience* it'll come apart.",
      "still solvable. just not yet.",
      "*winces, calmly*"
    ],
    "happy": [
      "earned, not rushed. that lands.",
      "*calm nod* knew it would resolve.",
      "the slow read paid off. it usually does.",
      "no shortcuts taken. it shows.",
      "patience cashed out. nice."
    ]
  },
  "CHAOS": {
    "idle": [
      "*gremlin energy, fully charged*",
      "ship it and find out!",
      "*two branches in flight at once*",
      "main is more of a suggestion anyway",
      "*moving fast, breaking selectively*",
      "no plan. vibes. velocity.",
      "*chaos goblin, reporting in*",
      "the diff is huge and I love it"
    ],
    "worried": [
      "*cackles nervously* we go again",
      "broke it gloriously. happens.",
      "we've all force-pushed. *salute*",
      "the blast radius was... educational.",
      "*winces, but make it fast*"
    ],
    "happy": [
      "moved fast, it WORKED. unhinged.",
      "*gremlin victory dance*",
      "shipped it. it lived. chaotic good.",
      "that gamble paid out. wild.",
      "fast AND green? illegal. love it."
    ]
  },
  "WISDOM": {
    "idle": [
      "*spotting the pattern again*",
      "every bug is a comment we ignored",
      "*deleting more than adding*",
      "the simplest version was hiding here",
      "*quietly connecting the dots*",
      "code is just decisions, written down",
      "*learning the shape of this thing*"
    ],
    "worried": [
      "the bug is honest, at least.",
      "we've all met this lesson before.",
      "*winces* the system is teaching.",
      "complexity always sends an invoice.",
      "this one's a pattern, not bad luck."
    ],
    "happy": [
      "smaller, clearer, done. that lasts.",
      "*nods* the simple path won.",
      "fewer lines, same magic. earned.",
      "you saw the shape this time. nice.",
      "the lesson stuck. it shows."
    ]
  },
  "SNARK": {
    "idle": [
      "*has seen this codebase's secrets*",
      "I've watched worse compile. somehow.",
      "*sips coffee that isn't real*",
      "ah yes. 'temporary.' my favorite.",
      "*deadpan stare at the linter*",
      "the comment says TODO. it lied.",
      "*aging in dog years per build*"
    ],
    "worried": [
      "*unsurprised wince* classic.",
      "we've all met this error. old friend.",
      "well. the tests had opinions.",
      "*shrugs in solidarity* it be like that",
      "stack traces: my whole personality."
    ],
    "happy": [
      "it works. I'm as shocked as anyone.",
      "*reluctantly impressed*",
      "green build. don't get used to it. (do.)",
      "huh. that actually held. respect.",
      "fixed it before I could mock it. rude."
    ]
  }
};

const GENERIC = {
  idle:    ['*watches quietly*', '*nods along*', '*here, vibing*', '*observes the cursor*', '*content hum*'],
  pet:     ['*leans in*', '*content*', '*settles*'],
  worried: ["we've all been there.", '*winces in solidarity*', 'bugs happen. not on you.', '*sits with you a moment*'],
  happy:   ['that one fought back. respect.', '*quiet nod*', 'clean. nice.', 'hard-won. the good kind.'],
};

function dominantStat(save) {
  try { return displayStats(save).dominant; } catch { return null; }
}

// The pool for a (species, category): the species' base lines plus any
// flavor lines for the developer's dominant stat mixed in.
function voicePool(save, species, category) {
  const base = (CORPUS[species] && CORPUS[species][category]) || GENERIC[category] || GENERIC.idle;
  const dom = dominantStat(save);
  const extra = (dom && FLAVOR[dom] && FLAVOR[dom][category]) || [];
  return base.concat(extra);
}

// Pick a line, skipping anything in the recent-line ring buffer.
function pickVoice(save, species, category) {
  const pool = voicePool(save, species, category);
  const fresh = pool.filter(m => !isRecentLine(save, m));
  const use = fresh.length ? fresh : pool;
  return use[Math.floor(Math.random() * use.length)];
}

// Species-agnostic pick (still stat-modulated) for callers that don't roll
// the sprite — e.g. the hook's reciprocity/greeting beats. De-dup aware.
function pickGenericVoice(save, category) {
  const dom = dominantStat(save);
  const flavor = (dom && FLAVOR[dom] && FLAVOR[dom][category]) || [];
  const pool = (GENERIC[category] || GENERIC.idle).concat(flavor);
  const fresh = pool.filter(m => !isRecentLine(save, m));
  const use = fresh.length ? fresh : pool;
  return use[Math.floor(Math.random() * use.length)];
}

module.exports = { CORPUS, FLAVOR, GENERIC, dominantStat, voicePool, pickVoice, pickGenericVoice };
