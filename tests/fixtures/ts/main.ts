import { greet } from './utils.js';
import { version as ver, helper } from './utils.js';
import type { SomeType } from './types.js';

interface Animal {
  name: string;
  speak(): string;
}

interface Pet extends Animal {
  owner: string;
}

class Dog implements Animal {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
  speak(): string {
    return greet(this.name);
  }
  wagTail(): void {
    console.log('wagging');
  }
}

// Arrow function assigned to const
const createDog = (name: string): Dog => new Dog(name);

// Regular function
function main(): void {
  const d = createDog('Rex');
  console.log(d.speak());
}

// Type alias
type Callback = (value: string) => void;

// Enum
enum Status {
  Active,
  Inactive,
}

// Async function
async function fetchData(url: string): Promise<string> {
  const response = await fetch(url);
  return response.text();
}

// Default export function
export default function defaultHandler() {
  return 'default';
}

// Exported const arrow
export const exportedArrow = (x: number) => x * 2;
