import { Parser } from '../src/parser/parser';

const test = '(x: string) -> x';

console.log('Parsing:', test);
try {
  const parser = new Parser(test);
  const ast = parser.parse();
  console.log('Success:\n', JSON.stringify(ast, null, 2));
} catch (e) {
  console.log('Error:', (e as Error).message);
  console.log('Stack:', (e as Error).stack);
}
