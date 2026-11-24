# Local setup for agents

1. Follow the [Windows quick start](README.md#quick-start-on-windows) or the [manual macOS or Linux setup](README.md#manual-setup-on-macos-or-linux). Use a fresh profile for demo testing. On Windows, build with `-NoBrowser`, then run `.\pilot.ps1 -Action Start -NoBrowser`.
2. Check `http://127.0.0.1:8784/health` and run the [offline tests](README.md#tests) with the profile's Python. Use the bundled CSVs for routine verification. The warehouse export instructions apply when the task explicitly calls for the warehouse.
3. Run `.\pilot.ps1 -Action Open` on Windows to hand off an authorized browser tab. In the new profile, the Datasets library starts empty. Add **Sales Company** and **Sales** to a new dataset and run Preview to check that both demo companies appear.

Keep runtime files, credentials, warehouse extracts, and saved dataset JSON in the local profile. The tracked shareable data is the synthetic snapshot in `demo-data/`.
