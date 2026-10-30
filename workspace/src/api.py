from .services import create_item

def health() -> dict[str, str]:
    return {'status': 'ok'}
