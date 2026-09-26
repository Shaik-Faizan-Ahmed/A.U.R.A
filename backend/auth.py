from fastapi import Header, HTTPException
import config


def get_institution_id(x_aura_key: str = Header(..., alias="X-AURA-Key")) -> str:
    """
    Resolves the caller's institution from the X-AURA-Key header.
    Every endpoint that touches submissions, flags, or fairness stats
    depends on this so data is always scoped per-institution.
    """
    institution_id = config.INSTITUTIONS.get(x_aura_key)
    if institution_id is None:
        raise HTTPException(status_code=401, detail="Invalid or missing X-AURA-Key")
    return institution_id
