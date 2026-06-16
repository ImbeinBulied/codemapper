import os
from typing import Optional

class Greeter:
    def __init__(self, name: str):
        self.name = name

    def greet(self) -> str:
        return f"Hello {self.name}"

def create_greeter(name: str) -> Greeter:
    return Greeter(name)

def main():
    g = create_greeter("World")
    print(g.greet())
