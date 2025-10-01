import { Parser } from '../src/parser/parser';

const lambdaTests = [
  '(x: string) -> uppercase x',
  '(x) -> x',
  '(x: string, y: number) -> add x y'
];

for (const test of lambdaTests) {
  console.log('\nTest:', test);
  try {
    const parser = new Parser(test);
    const ast = parser.parse();
    console.log('Success:', JSON.stringify(ast, null, 2));
  } catch (e) {
    console.log('Error:', (e as Error).message);
  }
}
