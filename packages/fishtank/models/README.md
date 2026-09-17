# Blender model contract

These GLBs are the editable source of truth for the fish shown by
`<fish-tank>`. A normal package build copies them into `dist/models/` and never
regenerates them.

Required animation nodes:

- `Tail`
- `FinPectoralL`
- `FinPectoralR`

These may be Blender empties or ordinary object parents. Their names and pivot
transforms matter; their exported Three.js node class does not.

Keep each node's origin at the joint where it should pivot. Fish face `+X` in
glTF space. Blender's glTF importer and exporter handle the up-axis conversion.

Export as **glTF Binary (.glb)** over the matching source file. The root object
may be renamed; the three animation-node names above must remain exact.
