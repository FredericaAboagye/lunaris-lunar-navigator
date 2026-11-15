
# 🌕 Lunaris — Intelligent Lunar Landing Site Navigator

### NASA Space Apps Challenge 2026 | Team Pitzer Connect

**Explore the Moon. Plan the Mission.**

Lunaris is an interactive lunar mission-planning application developed for the NASA Space Apps Challenge 2026.

Our goal is to make lunar exploration more accessible by helping users evaluate potential Moon landing sites based on solar illumination and Earth visibility.

**Challenge:** Lunar Landing Site Navigator  
**Event:** NASA Space Apps Challenge 2026 — Temecula, California  
**Team:** Pitzer Connect  
**Project Status:** 🚧 In Development

---

## 🚀 The Problem

Planning missions to the Moon's south pole is challenging because of extreme lighting conditions, complex terrain, and communication limitations.

Mission planners need to understand:

- When sunlight is available for solar power generation.
- Whether Earth is visible for direct communication.
- How these conditions vary by lunar location.
- How mission dates affect landing-site suitability.

Existing astronomical tools provide valuable information but can be difficult for non-specialists to navigate.

## 💡 Our Solution

Lunaris aims to simplify lunar mission planning through an intuitive, interactive dashboard.

Our application is designed to let users:

1. Select a lunar location.
2. Choose a mission date.
3. Retrieve Sun and Earth positions using NASA astronomical data.
4. Visualize solar elevation and Earth visibility.
5. Compare environmental conditions across candidate landing sites.

The long-term goal is to support informed decision-making through scientifically grounded visualizations.

## ✅ Current Progress

### Completed

- [x] Sun/Earth azimuth and elevation from NASA JPL Horizons at documented lunar points, cross-checked against Skyfield + NAIF SPICE kernels (agreement ≤ 1.7″).
- [x] Terrain horizons from LRO LOLA elevation (5 m/pix PGDA site maps + 80 m/pix PDS regional map to 250 km), including lunar curvature and observer height (1, 2, 10 m).
- [x] Four documented sites (Barker et al. 2021 RoI centroids) pass all checks; results are consistent with the published > 70 % illumination threshold (a threshold, not a matched value). See [docs/TERRAIN_VALIDATION.md](docs/TERRAIN_VALIDATION.md) and [docs/AUDIT.md](docs/AUDIT.md).
- [x] Metrics: Sun visible %, mean solar disk visible, longest darkness, Earth visible %, longest Earth outage, Sun+Earth overlap, regional slope screening.
- [x] NASA Web Design System UI: horizon panoramas, elevation-vs-horizon charts, visibility timeline, time cursor, terrain vs smooth-sphere toggle, CSV export.

### Next

- [ ] More documented sites (needs published points for Malapert, Haworth, Nobile).
- [ ] Per-site uncertainty bands from the PGDA DEM "clones".

## 🛠️ Technology Stack

| Component | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| Styling | NASA Web Design System (`nasawds`) + CSS tokens |
| Backend | Python, FastAPI |
| Charts | Recharts, custom SVG |
| HTTP Client | Requests |
| Scientific Data | NASA JPL Horizons |
| Version Control | Git and GitHub |

Additional tools may be introduced as development progresses.

## 📁 Project Structure

```text
lunaris-lunar-navigator/
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── App.css
│   │   └── index.css
│   ├── package.json
│   └── ...
├── backend/
│   ├── main.py
│   └── .venv/          # Local only; do not commit
├── README.md
├── LICENSE
└── .gitignore
```

## 💻 Getting Started

### Prerequisites

Install:

- Git
- Node.js and npm
- Python 3.9 or newer
- VS Code (recommended)

### 1. Clone the repository

```bash
git clone https://github.com/FredericaAboagye/lunaris-lunar-navigator.git
cd lunaris-lunar-navigator
```

### 2. Start the frontend

Open a terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local address shown by Vite, normally:

http://localhost:5173/

### 3. Start the backend

Open a **second terminal** from the repository root:

```bash
cd backend

python3 -m venv .venv
source .venv/bin/activate

pip install fastapi uvicorn requests

uvicorn main:app --reload --port 8000
```

The backend will run at:

http://127.0.0.1:8000/

### 4. Test the NASA data endpoint

Open:

http://127.0.0.1:8000/api/conditions?lat=-89.5&lon=0&day=2026-11-14

The endpoint requests Sun and Earth positions from NASA JPL Horizons for the specified lunar coordinates and date.

**Note:** The current implementation uses demonstration coordinates. These should not be interpreted as validated landing-site recommendations.

## 🌍 NASA Data and Resources

Our project uses:

**NASA JPL Horizons**  
https://ssd.jpl.nasa.gov/horizons/

Horizons provides astronomical ephemerides, including apparent Sun and Earth positions from specified lunar observing locations.

Additional lunar terrain and mapping resources under consideration:

- NASA Moon Trek: https://trek.nasa.gov/moon/
- LROC QuickMap: https://quickmap.lroc.asu.edu/

### Scientific Limitations

The current prototype calculates apparent positions relative to the geometric horizon.

It does not yet model:

- Local terrain obstructions.
- Crater-wall shadowing.
- Solar panel orientation.
- Complete illumination or communication windows.
- Mission safety or engineering feasibility.

Results should not be interpreted as certified landing-site assessments.

## 🤝 Team Collaboration

We welcome contributions from team members with backgrounds in computer science, software engineering, astronomy, aerospace, mathematics, data analysis, and design.

### Areas Where You Can Contribute

**Frontend Development**
- Improve the dashboard.
- Build interactive visualizations.
- Design site-comparison components.

**Backend Development**
- Improve NASA data integration.
- Validate astronomical calculations.
- Develop APIs for comparing locations and dates.

**Scientific Research**
- Research lunar geography and landing-site constraints.
- Identify authoritative NASA datasets.
- Validate interpretation of solar illumination and Earth visibility.

**UI/UX and Presentation**
- Design intuitive visualizations.
- Improve accessibility.
- Prepare project illustrations and the final demonstration.

**Testing and Documentation**
- Test application behavior.
- Document limitations.
- Help prepare the final submission.

## 🌿 GitHub Contribution Workflow

Please do not push directly to `main` without coordinating with the team.

### 1. Get the latest changes

```bash
git checkout main
git pull origin main
```

### 2. Create your own branch

```bash
git checkout -b feature/your-feature-name
```

For example:

```bash
git checkout -b feature/lunar-map
```

### 3. Make your changes

Edit the relevant files, test your work, and commit:

```bash
git add .
git commit -m "Add lunar map component"
```

### 4. Push your branch

```bash
git push -u origin feature/your-feature-name
```

### 5. Open a Pull Request

On GitHub:

1. Open the repository.
2. Navigate to **Pull Requests**.
3. Click **New Pull Request**.
4. Compare your feature branch against `main`.
5. Explain your changes.
6. Request a review from a teammate.

After review, changes can be merged into `main`.

## ⚠️ Important Development Guidelines

- Do not commit `.venv`, `node_modules`, passwords, or API secrets.
- Use NASA or appropriately licensed datasets.
- Document external code, assets, and research sources.
- Disclose AI-assisted code or content as required by NASA Space Apps rules.
- Test changes before submitting pull requests.
- Keep scientific claims accurate and clearly state limitations.
- Coordinate before modifying another teammate's files.

## 🎯 Project Goals

Our priority is to deliver a working, scientifically grounded prototype for the NASA Space Apps Challenge.

We aim to demonstrate how accessible software and NASA data can help users better understand the challenges of exploring the lunar south pole.

## 📜 License

This repository is licensed under the MIT License. See [LICENSE](LICENSE).

---

**Built by Team Pitzer Connect for the NASA Space Apps Challenge 2026.**

## Run locally

```bash
cd backend && pip install -r requirements.txt
uvicorn main:app --reload                 # http://127.0.0.1:8000/docs

cd frontend && npm install && npm run dev # http://localhost:5173
```

Set `VITE_API_URL` for the frontend and `FRONTEND_ORIGIN` for the backend when deploying. The runtime backend only needs the small JSON assets in `backend/data/terrain/` (committed); it never downloads terrain.

## Rebuild and validate terrain (offline)

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest -q tests                      # unit + API tests
python -m terrain.build                        # downloads ~500 MB once to terrain/.cache
python -m terrain.report                       # writes docs/TERRAIN_VALIDATION.md
python -m terrain.check_ephemeris -89.761966 202.932803   # Horizons vs Skyfield/SPICE
python -m terrain.explain_sunlight site04 1              # smooth sphere vs terrain decomposition
python -m terrain.check_timestep 2027-03-01 30           # time-step convergence
python3 ../scripts/e2e_check.py                          # needs API on :8000 and vite preview on :4173
python3 ../scripts/ui_check.py                           # interactive checks (pip install playwright; uses installed Chrome)
cd ../frontend && npm test                               # comparison and visibility-explanation logic
```
