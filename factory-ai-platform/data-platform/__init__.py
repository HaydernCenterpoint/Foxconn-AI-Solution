"""
Data Platform Package - Initialization
"""

__version__ = "1.0.0"
__author__ = "MKZ Factory Monitor Team"

# Package structure:
# data_platform/
# ├── migrations/        # SQL migration scripts
# ├── dualwrite/         # Dual-write middleware
# ├── backfill/          # Historical data migration
# ├── connectors/         # Data source connectors
# │   ├── erp/          # ERP connector
# │   ├── file_watcher/  # File import connector
# │   └── mes/          # MES connector
# ├── api/              # REST API service
# └── config.yaml       # Configuration
