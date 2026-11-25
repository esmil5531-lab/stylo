-- 0013 — STYLO identity (navy): category tile tints of the default tree move from the retired
-- burgundy palette to the brand palette. Only the exact old default values change: a colour the
-- team picked by hand in the back office is left as it is.
BEGIN;

UPDATE categories c SET color = m.new_color
  FROM (VALUES
    ('#5B0E2D', '#0B1F2E'),  -- burgundy      → deep navy
    ('#3F0820', '#13324A'),  -- dark burgundy → navy (lighter)
    ('#A85C76', '#355E5A'),  -- rose          → muted teal
    ('#C9A9A6', '#A79F8E'),  -- blush         → taupe
    ('#B08A5B', '#8A7A5C'),  -- caramel       → bronze
    ('#B79B87', '#7C8A8F'),  -- mocha         → slate
    ('#D4B8A8', '#C9C4B8'),  -- nude          → stone
    ('#8E8E8E', '#5F6870')   -- grey          → ink muted
  ) AS m(old_color, new_color)
 WHERE upper(c.color) = m.old_color;

COMMIT;
