/* ============================================================
   resources.js — THIS IS THE ONLY FILE YOU NEED TO EDIT
   ============================================================
   To add a resource page to the homepage:
     1. Create your page (e.g. python/loops.html)
     2. Add one entry to the RESOURCES list below
     3. Save. That's it — the homepage rebuilds itself.
   ============================================================ */


/* ---- 1. Site text -----------------------------------------
   Change the class name, tagline, and footer here.            */

const SITE = {
  name: "Coding Hub",
  tagline:
    "Every guide, cheat sheet, and practice set for our class, in one place.",
  updated: "September 2026",
  footer: "Built for Period 3. Something broken or missing? Tell me in class."
};


/* ---- 2. Categories ----------------------------------------
   These set the order of sections on the page and the colour
   used for each one. Add, remove, or reorder freely.
   `id` is what you type in a resource's `category` field.      */

const CATEGORIES = [
  {
    id: "start",
    name: "Start here",
    blurb: "Get your machine set up and know where things live.",
    color: "#2F6FED"
  },
  {
    id: "python",
    name: "Python",
    blurb: "Language basics, worked examples, and common errors.",
    color: "#1C7C6B"
  },
  {
    id: "web",
    name: "Web pages",
    blurb: "HTML, CSS, and JavaScript for building in the browser.",
    color: "#B03A8A"
  },
  {
    id: "practice",
    name: "Practice",
    blurb: "Problem sets and challenges to work through on your own.",
    color: "#C2611A"
  },
  {
    id: "tools",
    name: "Tools",
    blurb: "The editor, the terminal, Git, and how to hand work in.",
    color: "#6D4AC4"
  },
  {
    id: "reference",
    name: "Reference",
    blurb: "Look things up fast — syntax, shortcuts, vocabulary.",
    color: "#4B5A6B"
  }
];


/* ---- 3. Resources -----------------------------------------
   One object per page. Fields:

     title     required  What students see.
     url       required  Link to your page, e.g. "python/loops.html"
     category  required  Must match a category `id` above.
     desc      optional  One plain sentence. Keep it short.
     tags      optional  Words students might search for.
     isNew     optional  true  -> shows a "new" marker
     time      optional  e.g. "10 min read", "3 problems"
                                                                */

const RESOURCES = [
  {
    title: "Set up your editor",
    url: "start/editor.html",
    category: "start",
    desc: "Install VS Code, pick a theme, and turn on the settings we use.",
    tags: ["vs code", "install", "setup"],
    time: "10 min",
    isNew: true
  },
  {
    title: "How to turn in work",
    url: "start/handing-in.html",
    category: "start",
    desc: "Where files go, what to name them, and what counts as late.",
    tags: ["homework", "submit", "deadlines"]
  },
  {
    title: "Your first program",
    url: "start/first-program.html",
    category: "start",
    desc: "Write, save, and run a file from scratch without guessing.",
    tags: ["hello world", "run", "beginner"],
    time: "15 min"
  },

  {
    title: "Variables and types",
    url: "python/variables.html",
    category: "python",
    desc: "Storing values, naming them well, and what breaks when types mix.",
    tags: ["string", "int", "float", "naming"],
    time: "12 min"
  },
  {
    title: "Loops, step by step",
    url: "python/loops.html",
    category: "python",
    desc: "for and while, with a trace of what happens on every pass.",
    tags: ["for", "while", "range", "iteration"],
    time: "18 min"
  },
  {
    title: "Reading error messages",
    url: "python/errors.html",
    category: "python",
    desc: "The five errors you will hit most, and what each one is telling you.",
    tags: ["traceback", "syntaxerror", "debugging", "stuck"],
    isNew: true
  },
  {
    title: "Functions",
    url: "python/functions.html",
    category: "python",
    desc: "Writing your own, passing arguments, and returning a result.",
    tags: ["def", "return", "parameters"],
    time: "15 min"
  },

  {
    title: "HTML structure",
    url: "web/html.html",
    category: "web",
    desc: "The tags that hold a page together and how they nest.",
    tags: ["tags", "elements", "markup"],
    time: "12 min"
  },
  {
    title: "CSS layout",
    url: "web/css-layout.html",
    category: "web",
    desc: "Flexbox and grid, shown side by side on the same page.",
    tags: ["flexbox", "grid", "styling", "responsive"],
    time: "20 min"
  },
  {
    title: "JavaScript in the browser",
    url: "web/javascript.html",
    category: "web",
    desc: "Respond to clicks, change the page, and read what a user typed.",
    tags: ["dom", "events", "click", "interactive"]
  },

  {
    title: "Week 1–4 problem set",
    url: "practice/set-01.html",
    category: "practice",
    desc: "Twelve problems on variables, conditions, and loops.",
    tags: ["problems", "homework", "review"],
    time: "12 problems"
  },
  {
    title: "Debugging drills",
    url: "practice/debugging.html",
    category: "practice",
    desc: "Broken programs to fix. The bug is always findable.",
    tags: ["bugs", "fix", "practice"],
    time: "8 problems"
  },

  {
    title: "Terminal basics",
    url: "tools/terminal.html",
    category: "tools",
    desc: "Move between folders and run files without touching the mouse.",
    tags: ["command line", "cd", "ls", "shell"],
    time: "10 min"
  },
  {
    title: "Git and GitHub",
    url: "tools/git.html",
    category: "tools",
    desc: "Save versions of your work and get it onto GitHub.",
    tags: ["commit", "push", "version control"],
    time: "20 min"
  },

  {
    title: "Python cheat sheet",
    url: "reference/python-cheatsheet.html",
    category: "reference",
    desc: "One page. Every piece of syntax we have used this year.",
    tags: ["syntax", "quick", "lookup"]
  },
  {
    title: "Keyboard shortcuts",
    url: "reference/shortcuts.html",
    category: "reference",
    desc: "The shortcuts worth memorising, for Mac and Windows.",
    tags: ["vs code", "speed", "keys"]
  },
  {
    title: "Words we use in class",
    url: "reference/glossary.html",
    category: "reference",
    desc: "Plain definitions for the terms that get thrown around.",
    tags: ["glossary", "vocabulary", "definitions"]
  }
];
