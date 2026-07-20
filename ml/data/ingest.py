import shutil
import logging
from pathlib import Path
import pandas as pd
from numbers_parser import Document
from config import DATA_RAW

log = logging.getLogger(__name__)

def load_mumbai_raw(filepath: Path = DATA_RAW / "mumbai.csv") -> pd.DataFrame:
    """Loads the raw Mumbai property listings dataset from the raw folder.

    The file is actually a zipped Apple Numbers package, so we rename it
    temporarily to load it via the numbers-parser library. It merges the
    aligned tables on sheet 0 horizontally.

    Args:
        filepath: Path to the raw mumbai.csv file.

    Returns:
        pd.DataFrame containing the raw property listings.
    """
    if not filepath.exists():
        raise FileNotFoundError(f"Raw Mumbai dataset not found at: {filepath}")

    log.info("Ingesting raw Mumbai dataset from: %s", filepath)
    
    # Copy to a temporary file with .numbers extension for numbers-parser
    temp_path = filepath.with_suffix(".numbers")
    try:
        shutil.copy(filepath, temp_path)
        doc = Document(temp_path)
        sheet = doc.sheets[0]
        
        dfs = []
        for table in sheet.tables:
            rows = list(table.rows())
            if not rows:
                continue
            headers = [
                getattr(cell, 'value', None) if getattr(cell, 'value', None) is not None
                else f"col_{col_idx}"
                for col_idx, cell in enumerate(rows[0])
            ]
            data = [[getattr(cell, 'value', None) for cell in row] for row in rows[1:]]
            df = pd.DataFrame(data, columns=headers)
            dfs.append(df)
            
        if not dfs:
            raise ValueError(f"No tables found in sheet 0 of Numbers document: {filepath}")
            
        if len(dfs) > 1:
            log.info("Found %d tables in sheet 0. Merging horizontally.", len(dfs))
            for idx, df in enumerate(dfs):
                if idx > 0:
                    # Rename columns to avoid duplicates if they collide with table 0
                    df.columns = [f"{col}_{idx}" if col in dfs[0].columns else col for col in df.columns]
            final_df = pd.concat(dfs, axis=1)
        else:
            final_df = dfs[0]
            
        # Ensure PRICE column from table 1 is named properly
        if "PRICE_1" in final_df.columns:
            final_df = final_df.rename(columns={"PRICE_1": "PRICE"})
            
        # Validate columns
        required_cols = [
            "PROPERTY_TYPE", "CITY", "BEDROOM_NUM", "FURNISH", "AGE", 
            "TOTAL_FLOOR", "PROP_NAME", "AREA", "SOCIETY_NAME", 
            "BUILDING_NAME", "BALCONY_NUM", "FLOOR_NUM", "PRICE"
        ]
        
        missing = [c for c in required_cols if c not in final_df.columns]
        if missing:
            raise ValueError(f"Missing required columns in raw Mumbai dataset: {missing}")
            
        log.info("Successfully ingested raw Mumbai dataset of shape: %s", final_df.shape)
        return final_df
    finally:
        if temp_path.exists():
            temp_path.unlink()


def load_nhb_residex_raw(filepath: Path = DATA_RAW / "NHB Residex 13-26.csv") -> pd.DataFrame:
    """Loads the raw NHB Residex quarterly Housing Price Index dataset.

    Args:
        filepath: Path to the raw NHB Residex 13-26.csv file (Numbers format).

    Returns:
        pd.DataFrame containing 'Quarter' and 'Prices' columns.
    """
    if not filepath.exists():
        raise FileNotFoundError(f"Raw NHB Residex dataset not found at: {filepath}")

    log.info("Ingesting raw NHB Residex from: %s", filepath)
    
    # Copy to a temporary file with .numbers extension for numbers-parser
    temp_path = filepath.with_suffix(".numbers")
    try:
        shutil.copy(filepath, temp_path)
        doc = Document(temp_path)
        sheet = doc.sheets[0]
        table = sheet.tables[0]
        rows = list(table.rows())
        
        if not rows:
            raise ValueError(f"No rows found in sheet 0 of NHB Residex: {filepath}")
            
        headers = [getattr(cell, 'value', None) for cell in rows[0]]
        data = [[getattr(cell, 'value', None) for cell in row] for row in rows[1:]]
        df = pd.DataFrame(data, columns=headers)
        
        # Drop columns that are entirely null and rows missing key values
        df = df.dropna(how="all", axis=1)
        df = df.dropna(subset=["Quarter", "Prices"])
        
        # Validate columns
        if "Quarter" not in df.columns or "Prices" not in df.columns:
            raise ValueError(f"Missing required columns (Quarter, Prices) in NHB Residex. Found: {df.columns.tolist()}")
            
        log.info("Successfully ingested raw NHB Residex dataset of shape: %s", df.shape)
        return df
    finally:
        if temp_path.exists():
            temp_path.unlink()
