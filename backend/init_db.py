"""
Production database initialization script.
Run this once after deployment to set up demo data (optional).
"""
import os
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.db import connect, ensure_schema
from datetime import datetime, timedelta
import random


def create_demo_accounts():
    """Create demo trading accounts"""
    conn = connect()
    cur = conn.cursor()
    
    accounts = [
        ("Primary", 100000.0, datetime.now().isoformat()),
        ("Secondary", 50000.0, datetime.now().isoformat()),
    ]
    
    for account, cash, asof in accounts:
        cur.execute(
            "INSERT OR REPLACE INTO accounts (account, cash, asof) VALUES (?, ?, ?)",
            (account, cash, asof)
        )
    
    conn.commit()
    conn.close()
    print("✓ Created demo accounts")


def create_demo_instruments():
    """Create sample instruments"""
    conn = connect()
    cur = conn.cursor()
    
    # Sample stocks
    stocks = [
        ("AAPL", "Apple Inc."),
        ("MSFT", "Microsoft Corporation"),
        ("GOOGL", "Alphabet Inc."),
        ("AMZN", "Amazon.com Inc."),
        ("TSLA", "Tesla Inc."),
        ("NVDA", "NVIDIA Corporation"),
        ("META", "Meta Platforms Inc."),
        ("SPY", "SPDR S&P 500 ETF"),
    ]
    
    for symbol, name in stocks:
        instrument_id = f"{symbol}:EQ"
        cur.execute(
            """
            INSERT OR REPLACE INTO instruments 
            (id, symbol, asset_class, underlying, expiry, strike, option_type, multiplier, exchange, currency)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (instrument_id, symbol, "equity", symbol, None, None, None, 1.0, "NASDAQ", "USD")
        )
    
    conn.commit()
    conn.close()
    print("✓ Created sample instruments")


def create_demo_positions():
    """Create sample positions"""
    conn = connect()
    cur = conn.cursor()
    
    positions = [
        ("Primary", "AAPL:EQ", 100, 175.50, 17550.0, "Technology"),
        ("Primary", "MSFT:EQ", 75, 380.25, 28518.75, "Technology"),
        ("Primary", "GOOGL:EQ", 50, 140.80, 7040.0, "Technology"),
        ("Primary", "SPY:EQ", 200, 450.30, 90060.0, "ETF"),
        ("Secondary", "TSLA:EQ", 30, 242.50, 7275.0, "Automotive"),
        ("Secondary", "NVDA:EQ", 25, 480.75, 12018.75, "Technology"),
    ]
    
    for account, instrument_id, qty, price, market_value, sector in positions:
        cur.execute(
            """
            INSERT OR REPLACE INTO positions 
            (account, instrument_id, qty, price, market_value, sector)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (account, instrument_id, qty, price, market_value, sector)
        )
    
    conn.commit()
    conn.close()
    print("✓ Created sample positions")


def create_demo_nav_snapshots():
    """Create historical NAV snapshots"""
    conn = connect()
    cur = conn.cursor()
    
    # Create 30 days of historical data
    base_nav = 150000.0
    base_bench = 100.0
    
    for days_ago in range(30, 0, -1):
        date = (datetime.now() - timedelta(days=days_ago)).strftime("%Y-%m-%d")
        
        # Simulate some volatility
        nav_change = random.uniform(-0.02, 0.03)
        bench_change = random.uniform(-0.015, 0.025)
        
        nav = base_nav * (1 + nav_change)
        bench = base_bench * (1 + bench_change)
        
        cur.execute(
            "INSERT OR REPLACE INTO nav_snapshots (account, date, nav, bench) VALUES (?, ?, ?, ?)",
            ("ALL", date, nav, bench)
        )
        
        base_nav = nav
        base_bench = bench
    
    conn.commit()
    conn.close()
    print("✓ Created historical NAV snapshots")


def create_demo_trades():
    """Create sample trade history"""
    conn = connect()
    cur = conn.cursor()
    
    # Sample trades
    for i in range(10):
        days_ago = random.randint(1, 30)
        trade_date = (datetime.now() - timedelta(days=days_ago)).strftime("%Y-%m-%d")
        trade_time = f"{trade_date}T{random.randint(9, 15):02d}:{random.randint(0, 59):02d}:00"
        
        symbols = ["AAPL:EQ", "MSFT:EQ", "GOOGL:EQ", "SPY:EQ", "TSLA:EQ"]
        instrument_id = random.choice(symbols)
        symbol = instrument_id.split(":")[0]
        
        side = random.choice(["BUY", "SELL"])
        qty = random.randint(10, 100)
        price = random.uniform(100, 500)
        
        cur.execute(
            """
            INSERT OR REPLACE INTO trades 
            (trade_id, ts, trade_date, account, instrument_id, symbol, side, qty, price, 
             trade_type, status, source, asset_class, underlying, multiplier)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                f"TRADE_{i:04d}",
                trade_time,
                trade_date,
                "Primary",
                instrument_id,
                symbol,
                side,
                qty,
                price,
                "MARKET",
                "FILLED",
                "DEMO",
                "equity",
                symbol,
                1.0
            )
        )
    
    conn.commit()
    conn.close()
    print("✓ Created sample trades")


def initialize_production_db():
    """Main initialization function"""
    print("🚀 Initializing production database...")
    print("=" * 50)
    
    # Ensure schema exists
    print("Creating database schema...")
    ensure_schema()
    print("✓ Database schema created")
    
    # Create demo data (optional - can be skipped for live trading)
    create_demo = input("\nCreate demo data for testing? (y/n): ").lower() == 'y'
    
    if create_demo:
        print("\nCreating demo data...")
        create_demo_accounts()
        create_demo_instruments()
        create_demo_positions()
        create_demo_nav_snapshots()
        create_demo_trades()
        print("\n✅ Demo data created successfully!")
    else:
        print("\n✅ Database initialized without demo data")
    
    print("=" * 50)
    print("✅ Database initialization complete!")
    print("\nYou can now start the application.")


if __name__ == "__main__":
    initialize_production_db()
