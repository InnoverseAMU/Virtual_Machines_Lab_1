14. Rules for the AI coding agent

Follow the layer rule: nothing under src/core imports React, three.js, or Zustand.
Never hard-code an experiment in a component. Experiment-specific content lives only in src/core/experiments.
Terminal ids must follow componentId.terminalName and match exactly between the definition and the 3D component.
Wiring validation must use nets (union-find), never wire-by-wire comparison.
Add or update a Vitest test whenever validation or physics logic changes.
Use primitive geometry for apparatus until told otherwise.
Do not invent electrical values or connections; use the experiment definition, and flag anything unclear instead of guessing.
Keep changes small and runnable at each step; do not rewrite files that are not part of the task.
Do not add a backend, auth, or new libraries without asking.
