from .models import Item

def create_item(name: str) -> Item:
    return Item(name)
