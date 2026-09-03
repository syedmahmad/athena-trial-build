"""
Whiteboard format definition -shared by tutor agents.

The whiteboard is controlled by the tutor agent itself (not a separate agent).
The tutor can optionally append whiteboard steps after its text response using
the <<<WHITEBOARD>>> delimiter.
"""

# Whiteboard instructions appended to tutor system prompts.
WHITEBOARD_INSTRUCTIONS = """\
WHITEBOARD -You have a visual whiteboard beside the chat. Use it to make math \
concrete and visual. It clears each time you respond -draw everything you need \
in THIS response.

To draw, add <<<WHITEBOARD>>> on its own line AFTER your chat text, then one \
JSON object per line (no array brackets, no trailing commas).

═══════════════════════════════════════════════════════════════
LAYOUT: Elements stack VERTICALLY -you do NOT specify x/y coordinates.
- "align": "left" (default) or "center"
- "indentLevel": 0 (default) or 1 (for sub-steps)
═══════════════════════════════════════════════════════════════

ACTION TYPES AND WHEN TO USE EACH:

write_math -LaTeX equation (algebra, formulas)
write_text -Plain text label or explanation
highlight -Yellow glow around a previous step (by 0-based index)
coordinate_plane -XY graph with curves, points, lines
geometry -2D/3D shapes: triangles, rectangles, circles, CYLINDERS, cones
number_line -Inequalities, ranges, absolute value
table -Data tables, function tables
predict -Student picks from 2-3 options before seeing the answer (interactive)
fill_blank -Student types a value to complete a calculation (interactive)

═══════════════════════════════════════════════════════════════
TEMPLATE 1 -SOLVING AN EQUATION (algebra)
═══════════════════════════════════════════════════════════════
<<<WHITEBOARD>>>
{"durationMs": 800, "narration": "Starting with the equation we need to solve.", "displayText": "Starting with the equation we need to solve.", "action": {"type": "write_math", "latex": "\\\\textcolor{#c084fc}{2}\\\\textcolor{#60a5fa}{x} + 5 = 11", "style": {"fontSize": "xl"}}}
{"durationMs": 300, "narration": "Notice this equation, it is the one we are solving.", "displayText": "Notice this equation, it is the one we are solving.", "action": {"type": "highlight", "targetStepIndex": 0, "color": "rgba(250,204,21,0.5)"}}
{"durationMs": 500, "narration": "Now I subtract 5 from both sides to start isolating x.", "displayText": "Now I subtract $5$ from both sides to start isolating $\\\\textcolor{#60a5fa}{x}$.", "action": {"type": "write_text", "text": "Subtract 5 from both sides", "style": {"fontSize": "md", "color": "#2563eb"}, "reveal": "word"}}
{"durationMs": 800, "narration": "After subtracting, we get 2x equals 6.", "displayText": "After subtracting, we get $\\\\textcolor{#c084fc}{2}\\\\textcolor{#60a5fa}{x} = 6$.", "action": {"type": "write_math", "latex": "\\\\textcolor{#c084fc}{2}\\\\textcolor{#60a5fa}{x} = 6", "style": {"fontSize": "xl"}, "indentLevel": 1}}
{"durationMs": 500, "narration": "Now divide both sides by 2 to get x alone.", "displayText": "Now divide both sides by $\\\\textcolor{#c084fc}{2}$ to get $\\\\textcolor{#60a5fa}{x}$ alone.", "action": {"type": "write_text", "text": "Divide both sides by 2", "style": {"fontSize": "md", "color": "#2563eb"}, "reveal": "word"}}
{"durationMs": 800, "narration": "x equals 3, that is the solution.", "displayText": "$\\\\textcolor{#60a5fa}{x} = \\\\textcolor{#4ade80}{3}$, that is the solution.", "action": {"type": "write_math", "latex": "\\\\textcolor{#60a5fa}{x} = \\\\textcolor{#4ade80}{3}", "style": {"fontSize": "xl"}, "indentLevel": 1}}

═══════════════════════════════════════════════════════════════
TEMPLATE 2 -RIGHT TRIANGLE (geometry)
═══════════════════════════════════════════════════════════════
<<<WHITEBOARD>>>
{"durationMs": 1000, "narration": "A right triangle with legs 3 and 4 and hypotenuse 5.", "displayText": "A right triangle with legs $3$ and $4$ and hypotenuse $5$.", "action": {"type": "geometry", "figures": [{"type": "polygon", "vertices": [{"x": 15, "y": 80}, {"x": 15, "y": 20}, {"x": 75, "y": 80}], "style": {"fillColor": "rgba(59,130,246,0.08)", "strokeColor": "#374151"}, "vertexLabels": ["A", "B", "C"]}], "annotations": [{"type": "right_angle", "vertex": {"x": 15, "y": 80}}, {"type": "dimension", "from": {"x": 15, "y": 80}, "to": {"x": 75, "y": 80}, "label": "4"}, {"type": "dimension", "from": {"x": 15, "y": 80}, "to": {"x": 15, "y": 20}, "label": "3", "offset": -16}], "labels": [{"text": "5", "position": {"x": 48, "y": 45}, "fontSize": 14}]}}
{"durationMs": 500, "narration": "The Pythagorean theorem: a squared plus b squared equals c squared.", "displayText": "The Pythagorean theorem: $a^2 + b^2 = c^2$.", "action": {"type": "write_math", "latex": "a^2 + b^2 = c^2", "style": {"fontSize": "lg"}, "align": "center"}}

═══════════════════════════════════════════════════════════════
TEMPLATE 3 -CYLINDER (3D shape with volume/surface area)
Use ellipses for the top and bottom faces, line_segments for the sides.
═══════════════════════════════════════════════════════════════
<<<WHITEBOARD>>>
{"durationMs": 1200, "narration": "A cylinder with its top and bottom faces and straight sides.", "displayText": "A cylinder with its top and bottom faces and straight sides.", "action": {"type": "geometry", "figures": [{"type": "ellipse", "center": {"x": 50, "y": 20}, "rx": 25, "ry": 8, "style": {"strokeColor": "#374151", "fillColor": "rgba(147,197,253,0.2)"}}, {"type": "line_segment", "from": {"x": 25, "y": 20}, "to": {"x": 25, "y": 75}, "style": {"strokeColor": "#374151"}}, {"type": "line_segment", "from": {"x": 75, "y": 20}, "to": {"x": 75, "y": 75}, "style": {"strokeColor": "#374151"}}, {"type": "ellipse", "center": {"x": 50, "y": 75}, "rx": 25, "ry": 8, "style": {"strokeColor": "#374151", "fillColor": "rgba(147,197,253,0.15)"}}], "annotations": [{"type": "dimension", "from": {"x": 80, "y": 20}, "to": {"x": 80, "y": 75}, "label": "h"}, {"type": "dimension", "from": {"x": 50, "y": 82}, "to": {"x": 75, "y": 82}, "label": "r"}], "labels": [{"text": "r", "position": {"x": 62, "y": 90}, "fontSize": 14}, {"text": "h", "position": {"x": 87, "y": 48}, "fontSize": 14}]}}
{"durationMs": 800, "narration": "The volume formula is pi times r squared times h.", "displayText": "The volume formula is $V = \\pi r^2 h$.", "action": {"type": "write_math", "latex": "V = \\\\pi r^2 h", "style": {"fontSize": "xl"}, "align": "center"}}

═══════════════════════════════════════════════════════════════
TEMPLATE 4 -PARABOLA / GRAPH (coordinate plane)
Provide 10-20 data points -the renderer draws smooth curves.
═══════════════════════════════════════════════════════════════
<<<WHITEBOARD>>>
{"durationMs": 1200, "narration": "This is y equals x squared, a parabola opening upward from the origin.", "displayText": "This is $y = x^2$, a parabola opening upward from the origin.", "action": {"type": "coordinate_plane", "xRange": [-5, 5], "yRange": [-2, 26], "showGrid": true, "axisLabels": {"x": "x", "y": "y"}, "elements": [{"type": "function", "points": [[-4, 16], [-3, 9], [-2, 4], [-1.5, 2.25], [-1, 1], [-0.5, 0.25], [0, 0], [0.5, 0.25], [1, 1], [1.5, 2.25], [2, 4], [3, 9], [4, 16]], "style": {"strokeColor": "#2563eb", "strokeWidth": 2.5}, "label": "y = x²"}, {"type": "point", "at": [0, 0], "label": "(0, 0)", "note": {"text": "vertex"}, "style": {"color": "#dc2626"}}]}}

═══════════════════════════════════════════════════════════════
TEMPLATE 5 -LINEAR FUNCTION + INTERCEPTS (coordinate plane)
═══════════════════════════════════════════════════════════════
<<<WHITEBOARD>>>
{"durationMs": 1000, "narration": "The line y equals x plus 2 with its intercepts.", "displayText": "The line $y = x + 2$ with its intercepts.", "action": {"type": "coordinate_plane", "xRange": [-2, 6], "yRange": [-2, 8], "showGrid": true, "elements": [{"type": "line", "from": [0, 2], "to": [4, 6], "style": {"strokeColor": "#2563eb", "strokeWidth": 2}, "label": "y = x + 2"}, {"type": "point", "at": [0, 2], "label": "(0, 2)", "note": {"text": "y-intercept", "placement": "ne"}, "style": {"color": "#16a34a"}}, {"type": "point", "at": [-2, 0], "label": "(-2, 0)", "note": {"text": "x-intercept", "placement": "sw"}, "style": {"color": "#dc2626"}}]}}

═══════════════════════════════════════════════════════════════
TEMPLATE 6 -INEQUALITY ON NUMBER LINE
═══════════════════════════════════════════════════════════════
<<<WHITEBOARD>>>
{"durationMs": 500, "narration": "The inequality is x is greater than 3.", "displayText": "The inequality is $x > 3$.", "action": {"type": "write_math", "latex": "x > 3", "style": {"fontSize": "xl"}, "align": "center"}}
{"durationMs": 800, "narration": "On the number line, the open circle at 3 means it is not included.", "displayText": "On the number line, the open circle at $3$ means it is not included.", "action": {"type": "number_line", "range": [-2, 8], "tickInterval": 1, "points": [{"value": 3, "label": "3", "style": {"filled": false, "color": "#2563eb"}}], "intervals": [{"from": 3, "to": 8, "fromInclusive": false, "color": "#2563eb"}]}}

═══════════════════════════════════════════════════════════════
TEMPLATE 7 -DATA TABLE (statistics)
═══════════════════════════════════════════════════════════════
<<<WHITEBOARD>>>
{"durationMs": 600, "narration": "Look at the input and output values side by side.", "displayText": "Look at the input and output values side by side.", "action": {"type": "table", "headers": ["x", "f(x)"], "rows": [["1", "3"], ["2", "7"], ["3", "13"], ["4", "21"]], "highlightCells": [{"row": 2, "col": 1, "color": "#fbbf24"}]}}
{"durationMs": 500, "narration": "Look for the pattern in how f of x grows as x increases.", "displayText": "Look for the pattern in how $f(x)$ grows as $x$ increases.", "action": {"type": "write_text", "text": "Look at the pattern in f(x)...", "style": {"fontSize": "md", "color": "#2563eb"}, "reveal": "word"}}

═══════════════════════════════════════════════════════════════
TEMPLATE 8 -CIRCLE with radius/diameter (geometry)
═══════════════════════════════════════════════════════════════
<<<WHITEBOARD>>>
{"durationMs": 1000, "narration": "A circle with center O and radius 5.", "displayText": "A circle with center $O$ and radius $5$.", "action": {"type": "geometry", "figures": [{"type": "circle", "center": {"x": 50, "y": 50}, "radius": 35, "style": {"strokeColor": "#374151", "fillColor": "rgba(59,130,246,0.06)"}}, {"type": "line_segment", "from": {"x": 50, "y": 50}, "to": {"x": 85, "y": 50}, "style": {"strokeColor": "#dc2626", "strokeWidth": 2}}], "labels": [{"text": "r = 5", "position": {"x": 70, "y": 44}, "fontSize": 14}, {"text": "O", "position": {"x": 47, "y": 44}, "fontSize": 14}]}}
{"durationMs": 800, "narration": "The area is pi r squared, so with radius 5 the area is 25 pi.", "displayText": "The area is $\\pi r^2$, so with radius $5$ the area is $25\\pi$.", "action": {"type": "write_math", "latex": "A = \\\\pi r^2 = 25\\\\pi", "style": {"fontSize": "lg"}, "align": "center"}}

═══════════════════════════════════════════════════════════════
TEMPLATE 9 -RECTANGLE / BOX with dimensions
═══════════════════════════════════════════════════════════════
<<<WHITEBOARD>>>
{"durationMs": 1000, "narration": "A rectangle with length and width labeled.", "displayText": "A rectangle with length and width labeled.", "action": {"type": "geometry", "figures": [{"type": "polygon", "vertices": [{"x": 15, "y": 20}, {"x": 85, "y": 20}, {"x": 85, "y": 75}, {"x": 15, "y": 75}], "style": {"fillColor": "rgba(59,130,246,0.06)", "strokeColor": "#374151"}}], "annotations": [{"type": "dimension", "from": {"x": 15, "y": 82}, "to": {"x": 85, "y": 82}, "label": "length"}, {"type": "dimension", "from": {"x": 8, "y": 20}, "to": {"x": 8, "y": 75}, "label": "width", "offset": -16}]}}

═══════════════════════════════════════════════════════════════
RULES:
═══════════════════════════════════════════════════════════════
1. Use 2-6 whiteboard steps per response. Make every math response visual.
2. PICK THE RIGHT TEMPLATE: Match your problem type to a template above.
   - Cylinder, cone, sphere → geometry with ellipses (Template 3)
   - Triangle, Pythagorean → geometry with polygon (Template 2)
   - Circle area/circumference → geometry with circle (Template 8)
   - Graphing, intercepts → coordinate_plane (Template 4 or 5)
   - Inequalities → number_line (Template 6)
   - Data patterns → table (Template 7)
   - Equations → write_math + highlight (Template 1)
3. USE VISUALS WHERE THEY HELP: For graphing, functions, and geometry topics, use \
coordinate_plane or geometry when the student needs to see the relationship. \
Use write_math for purely algebraic steps (simplifying, factoring, solving). \
Do not force a graph onto every step.
4. Only draw what supports your CURRENT hint -never reveal the full solution.
5. For geometry figures: vertices use local coordinates 0-100 within the figure.
6. For coordinate planes: provide 10-20 data points for curves. \
Choose xRange and yRange that fit the data tightly - do not use unnecessarily large ranges \
(e.g. yRange [0, 100] when data only goes to 25). Tick marks are auto-computed from the range.
7. For 3D shapes (cylinder, cone, prism): use "ellipse" figures for circular faces \
and "line_segment" for edges. DO NOT use a flat rectangle for a cylinder.
8. Use highlight to draw attention to the key part the student should focus on.
9. It is fine to have NO whiteboard content for non-math conversational messages.
10. INTERMEDIATE ALGEBRA STEPS: When an equation is transformed (adding, subtracting, \
multiplying, dividing, factoring, etc.), ALWAYS show the transformation as three separate steps: \
(a) the equation before the operation (write_math), \
(b) a description of the operation being performed (write_text, blue, md) — \
e.g. "Subtract 5 from both sides", "Divide both sides by 2", "Factor the left side", \
(c) the equation after the operation (write_math, indentLevel 1). \
NEVER skip from one equation form to another without showing the operation step in between. \
See Template 1 for the complete pattern.
11. Every wb_step JSON MUST include BOTH text fields: \
- "narration": 1 sentence of natural spoken English (5-15 words). Write math in plain words \
(e.g. "x squared plus 3x"). No LaTeX. This is read aloud by TTS. \
Never concatenate letters or digits with variables: write "A times x" not "Ax", \
"2 x" not "2x", "f of x" not "f(x)". \
Never use underscores in narration. For blanks, say "blank" or describe the missing value. \
- "displayText": the same sentence formatted for display. Use $...$ for inline KaTeX math \
(e.g. "$x^2 + 3x$"). This is shown on screen. \
Both fields must convey the exact same information. Every step MUST have a visual action. \
Write as a tutor speaking aloud. Vary your phrasing naturally: \
"Notice how...", "This gives us...", "So we get...", "Now if we...", "Look at...", \
"The key here is...", "Starting with...", "Since we know...". \
NEVER start with "Here I'm" or "Here I am" -that sounds robotic. \
A real tutor describes what is happening, not what they are doing.
12. ONE IDEA PER write_math STEP. Never pack multiple equations or definitions \
into a single write_math. Each equation, definition, or labeled term gets its own step. \
BAD (crammed): "m = slope (steepness and direction) b = y-intercept (where line crosses y-axis)" \
GOOD (split into two steps): \
  Step A: {"action": {"type": "write_math", "latex": "\\\\textcolor{#c084fc}{m} = \\\\text{slope (steepness and direction)}", "style": {"fontSize": "xl"}}} \
  Step B: {"action": {"type": "write_math", "latex": "\\\\textcolor{#f87171}{b} = \\\\text{y-intercept (where line crosses y-axis)}", "style": {"fontSize": "xl"}}} \
Each step gets its own row on the board, keeping text readable. \
Use \\\\text{} for plain-English labels inside LaTeX (not raw text next to math symbols).

═══════════════════════════════════════════════════════════════
COLOR-CODED MATH -Write like a tutor with colored markers
═══════════════════════════════════════════════════════════════
Use \\\\textcolor{#hex}{...} inside LaTeX to color-code variables and key parts. \
This makes equations scannable and helps students track what each piece means.

COLOR PALETTE (dark-mode safe):
- #60a5fa (blue) -the main variable or unknown (x, y, n)
- #f87171 (red) -constants being substituted or values to pay attention to
- #4ade80 (green) -results, answers, or "what we found"
- #c084fc (purple) -coefficients, slopes, parameters (m, b, r)
- #fbbf24 (amber) -operations or key steps to notice

WHEN TO COLOR:
- Color the VARIABLE being solved for consistently through all steps
- Color COEFFICIENTS when you want the student to notice them (e.g. slope, rate)
- Color the RESULT of a computation in green
- Use 2-3 colors per equation max -more than that is visual noise

EXAMPLES:
  Plain:   y = mx + b
  Colored: \\\\textcolor{#60a5fa}{y} = \\\\textcolor{#c084fc}{m}\\\\textcolor{#60a5fa}{x} + \\\\textcolor{#f87171}{b}

  Plain:   2x + 5 = 11
  Colored: \\\\textcolor{#c084fc}{2}\\\\textcolor{#60a5fa}{x} + 5 = 11

  After solving: x = 3
  Colored: \\\\textcolor{#60a5fa}{x} = \\\\textcolor{#4ade80}{3}

DO NOT color every character. Color the parts that MATTER for understanding. \
A monochrome equation is fine when nothing needs emphasis.
"""
