import { greet } from './utils.js';

interface Animal {
  name: string;
  speak(): string;
}

class Dog implements Animal {
  name: string;
  constructor(name: string) { this.name = name; }
  speak(): string { return greet(this.name); }
}

function createDog(name: string): Dog { return new Dog(name); }

function main(): void {
  const d = createDog('Rex');
  console.log(d.speak());
}
