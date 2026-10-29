"""Publish the original Barker dashboard from its CSV folder."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from datetime import date, timedelta
from verify_publication import verify

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'frontend/public/data'
FILES=['workspace.json','nav-history.json','market.json','verification.json','verification.md']


def run(args, cwd=ROOT):
    subprocess.run(args,cwd=cwd,check=True)


def refresh_market():
    import yfinance as yf
    workspace=json.loads((DATA/'workspace.json').read_text())
    asof=date.fromisoformat(workspace['as_of'])
    symbols={'^GSPC','XLC','XLY','XLP','XLE','XLF','XLV','XLI','XLK','XLB','XLRE','XLU'}
    for account in workspace['state']['accounts'].values():
        for position in account.get('positions',[]):
            symbol=position.get('historySymbol') or position.get('baseSymbol') or position.get('cleanSym')
            if symbol and ' ' not in symbol: symbols.add(symbol)
    frame=yf.download(sorted(symbols),start=f'{asof.year-10}-{asof.month:02}-{min(asof.day,28):02}',end=(asof+timedelta(days=1)).isoformat(),progress=False,auto_adjust=False,threads=True)
    market={}
    for symbol in sorted(symbols):
        series=frame['Close'][symbol].dropna()
        if len(series): market[symbol]=[[day.strftime('%Y-%m-%d'),float(value)] for day,value in series.items() if day.strftime('%Y-%m-%d')<=asof.isoformat()]
    (DATA/'market.json').write_text(json.dumps(market,separators=(',',':'),allow_nan=False))
    print(f'Prepared market history for {len(market)} symbols',flush=True)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--csv-dir',type=Path,default=Path.home()/'Desktop/Dashboard CSV')
    parser.add_argument('--prepare-only',action='store_true',help='Verify and build without committing or publishing')
    args=parser.parse_args()
    if not args.csv_dir.is_dir(): parser.error(f'CSV folder does not exist: {args.csv_dir}')
    if not args.prepare_only:
        staged=subprocess.check_output(['git','diff','--cached','--name-only'],cwd=ROOT,text=True).strip()
        if staged: raise RuntimeError('Finish the existing staged Git changes before publishing')
        run(['git','fetch','origin'])
        head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT)
        remote=subprocess.check_output(['git','rev-parse','origin/main'],cwd=ROOT)
        if head!=remote: raise RuntimeError('Local branch differs from GitHub; reconcile it before publishing')
    backups={name:(DATA/name).read_bytes() if (DATA/name).exists() else None for name in FILES}
    try:
        run(['node','scripts/publish-original.mjs',str(args.csv_dir.resolve())],ROOT/'frontend')
        verify(args.csv_dir,DATA)
        refresh_market()
        run(['npm','run','typecheck'],ROOT/'frontend')
        run(['npm','run','build:static'],ROOT/'frontend')
    except BaseException:
        for name,content in backups.items():
            if content is None: (DATA/name).unlink(missing_ok=True)
            else: (DATA/name).write_bytes(content)
        raise
    if args.prepare_only:
        print('Verified and built. No GitHub changes or deployment requested.')
        return
    paths=['frontend/public/data/'+name for name in FILES]
    run(['git','add','--',*paths])
    changed=subprocess.run(['git','diff','--cached','--quiet'],cwd=ROOT).returncode
    if changed:
        asof=json.loads((DATA/'workspace.json').read_text())['as_of']
        run(['git','commit','-m',f'Publish verified portfolio as of {asof}','--',*paths])
        run(['git','push','origin','main'])
    print('Published to GitHub. Render deploys automatically. Check https://barker-portfolio-static.onrender.com/')


if __name__=='__main__': main()
