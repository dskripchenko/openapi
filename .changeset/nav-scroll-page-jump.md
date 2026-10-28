---
'@dskripchenko/openapi': patch
---

**An embedded reference no longer pulls the page while it scrolls.** The navigation followed the section in view with `scrollIntoView`, which scrolls every scrolling ancestor, the host page among them: in a box on a longer page (a wiki macro, an article) whose top had scrolled past the window, each new section pulled the page back to show its link, and scrolling jerked back and forth. The navigation and the search hits now scroll only their own list.
