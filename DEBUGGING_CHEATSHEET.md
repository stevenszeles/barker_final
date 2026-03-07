# VS Code Debugging Keyboard Shortcuts

## 🎮 Core Debugging Controls

| Action | Mac Shortcut | Notes |
|--------|-------------|-------|
| **Start/Continue** | F5 | Start debugger or resume after pause |
| **Pause** | F6 | Pause execution at current location |
| **Step Over** | F10 | Execute current line, don't enter functions |
| **Step Into** | F11 | Enter function calls to debug inside them |
| **Step Out** | ⇧F11 | Exit current function back to caller |
| **Toggle Breakpoint** | ⌘K ⌘B | Add/remove breakpoint on current line |
| **Stop** | ⇧F5 | Stop the debugger |
| **Restart** | ⌘⇧F5 | Restart the debugging session |

## 🔍 Inspection

| Action | Shortcut |
|--------|----------|
| **Open Debug Console** | ⇧⌘Y |
| **Open Variables Panel** | ⇧⌘D (then click Variables tab) |
| **Hover for quick info** | Hover over variable name while debugging |

## 🎯 Running Tasks

| Action | Shortcut |
|--------|----------|
| **Run Task** | ⇧⌘P → "Run Task" |
| **Terminate Task** | ⇧⌘P → "Terminate Task" |
| **Show Output** | ⇧⌘U |

---

## 📋 Common Debug Scenarios

### Scenario 1: API Returns Wrong Data
```
1. Click Run & Debug (⌘⇧D)
2. Select "FastAPI Backend (uvicorn)"
3. Press F5
4. Find the router function in backend/app/routers/
5. Click left margin to set breakpoint
6. Make API request (curl or frontend)
7. Step through with F10/F11 to see what's happening
```

### Scenario 2: CSV Import Not Working
```
1. Click Run & Debug (⌘⇧D)
2. Select "pytest - CSV Import Tests"
3. Press F5 to start
4. Click left margin in test file to set breakpoint
5. Watch test execution pause at breakpoint
6. Use Debug Console to inspect parsed data
```

### Scenario 3: Stock Quote Updates Broken
```
1. Open backend/app/services/legacy_engine.py or schwab.py
2. Find the function that fetches quotes
3. Set breakpoint on line where issue likely is
4. Start "FastAPI Backend (uvicorn)" (F5)
5. Trigger the quote update (e.g., via /portfolio/snapshot)
6. Step through execution, checking variable values
```

---

## 💡 Pro Tips

### Using the Debug Console
While paused, type Python expressions:
```python
# View a variable
positions[0]

# Check if condition
if nav[-1] > 100000: print("Rich!")

# Call a function
calculate_sharpe(returns)

# Check object attributes  
quote.__dict__
```

### Watch Expressions
1. In Debug sidebar, click "Watch"
2. Click "+" and add an expression like:
   - `len(positions)` - auto-updates
   - `nav[-1] * 0.95` - calculations
   - `type(response)` - type checking

### Conditional Breakpoints
For code that loops or is called many times:
1. Right-click breakpoint (red dot)
2. "Edit Breakpoint"
3. Add condition: `i > 100 and symbol == 'AAPL'`
4. Only pauses when condition is true

### Logpoints (Log Without Stopping)
For high-frequency code:
1. Right-click line number
2. "Add Logpoint"
3. Type: `Symbol {symbol} at {price}`
4. Prints to console without stopping

---

## 🚨 Quick Fixes

**Breakpoint not working?**
- Ensure "justMyCode" is true in launch.json
- Make sure file is saved
- Try restarting debugger (⇧F5)

**Variables showing as "Not Available"?**
- This is normal in optimized code
- Step through more carefully
- Check Debug Console instead

**Debugger too slow?**
- Set `"justMyCode": false` to skip library code
- Use F10 (step over) instead of F11 (step into) more

**Port 8000 already in use?**
Terminal: `lsof -i :8000 | grep LISTEN | awk '{print $2}' | xargs kill -9`
Or change port in launch.json

---

Have fun debugging! 🐛
