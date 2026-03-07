# VS Code Debugging Setup - Quick Start

## 🐛 Debugger Configurations

Your VS Code debugger is now configured with the following launch options:

### 1. **FastAPI Backend (uvicorn)** - *Recommended for debugging API*
- Starts the backend server with hot-reload
- Set breakpoints in `backend/app/` files
- Access the API at `http://localhost:8000`
- Docs at `http://localhost:8000/docs`

**How to use:**
1. Click Run & Debug (⌘⇧D on Mac)
2. Select "FastAPI Backend (uvicorn)"
3. Press F5 or click the green play button
4. Set breakpoints by clicking the left margin on any line

### 2. **Python: Current File** - *For quick script testing*
- Debug any single Python file you have open
- Click Run & Debug and select this option

### 3. **pytest - CSV Import Tests** - *For testing CSV import logic*
- Runs the targeted CSV import regression tests
- Great for debugging import workflows

### 4. **pytest - All Tests** - *For running full test suite*
- Run all backend tests with debugging enabled

---

## ⌨️ Available VS Code Tasks

Access these via Terminal → Run Task (⇧⌘P → "Run Task")

- **Backend: Run with uvicorn (dev)** - Start backend server in background
- **Frontend: Install and Dev** - Start frontend dev server
- **Tests: CSV Import** - Run CSV import tests
- **Tests: All** - Run all tests
- **Docker: Build and Run** - Build and start Docker containers
- **Docker: Stop** - Stop Docker containers

---

## 🎯 Common Debugging Workflows

### Debugging API Requests
1. Set a breakpoint in the router file (e.g., `backend/app/routers/portfolio.py`)
2. Start "FastAPI Backend (uvicorn)" debugger
3. Make an API request (via frontend or curl)
4. Execution will pause at your breakpoint
5. Use Debug Console to inspect variables

### Debugging the Engine (legacy_engine.py)
1. Set a breakpoint in `backend/app/services/legacy_engine.py`
2. Trigger the code path that calls that function (e.g., via /portfolio/snapshot)
3. Step through with F10 (step over) or F11 (step into)

### Debugging Tests
1. Open the test file in `backend/tests/test_csv_import.py`
2. Set breakpoints in the test or code being tested
3. Start "pytest - CSV Import Tests" debugger
4. Watch the test execution pause at breakpoints

### Debugging Frontend Issues
- Since frontend is Vite + React, use browser DevTools (F12)
- Set breakpoints in browser DevTools for JS/React debugging
- Use Redux DevTools browser extension if needed for Zustand state

---

## 🔍 Debugging Tips

### Inspect Variables
In Debug Console, type Python expressions:
```python
# Check variable value
snapshot

# Check type
type(nav_series)

# Check length
len(positions)

# Evaluate expressions
nav_series[-1] * 1.05
```

### Use Watch Expressions
Add watches in the Debug sidebar to track specific variables across pauses

### Conditional Breakpoints
- Right-click a breakpoint → Edit Breakpoint
- Add a condition like `len(symbols) > 10`
- Only pause when condition is true

### Logpoints (Non-breaking logs)
- Right-click line → Add Logpoint
- Print to console without stopping execution
- Useful for high-frequency code paths

---

## 🚀 Quick Start Steps

1. **Open workspace:**
   ```bash
   code /Users/stevenszeles/Downloads/barker_final
   ```

2. **Install Python extensions:**
   - Open Extensions (⌘⇧X)
   - Install "Python" and "Pylance" from Microsoft

3. **Select Python interpreter:**
   - ⌘⇧P → "Python: Select Interpreter"
   - Choose the one in `.venv-nav` or your virtual environment

4. **Start debugging:**
   - Press ⌘⇧D
   - Select "FastAPI Backend (uvicorn)"
   - Press F5

5. **Set breakpoints:**
   - Click left margin on any line
   - Breakpoint appears as red dot

6. **Test the API:**
   - Navigate to `http://localhost:8000/docs` in browser
   - Try API endpoints
   - Execution will pause at your breakpoints

---

## 📝 Environment Setup

The debugger uses your existing Python environment. If you haven't installed dependencies:

```bash
# With venv
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# OR with existing .venv-nav
source .venv-nav/bin/activate
pip install -r requirements.txt
```

---

## 🆘 Troubleshooting

**"No module named 'uvicorn'"**
→ Run: `pip install -r requirements.txt`

**"Python interpreter not found"**
→ ⌘⇧P → "Python: Select Interpreter" → Choose one in `.venv-nav`

**Breakpoints not pausing**
→ Check "justMyCode": true in launch.json allows library debugging

**"Address already in use" for port 8000**
→ Either change port in launch.json or: `lsof -i :8000 | grep LISTEN | awk '{print $2}' | xargs kill -9`

---

Good luck debugging! 🎉
