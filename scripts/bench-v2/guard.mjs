import {parse} from 'acorn';

const words = text => new Set(text.split(/\s+/));
const builtins = words('cua nodeRepl console undefined NaN Infinity Number String Boolean JSON Math parseInt parseFloat RegExp');
const functions = words('Number String Boolean parseInt parseFloat RegExp');
const forbidden = words('process require module exports global globalThis eval Function AsyncFunction Reflect Object Buffer WebAssembly fetch Deno Bun __dirname __filename __proto__ constructor prototype import setTimeout setInterval queueMicrotask');
const blockedFields = words('env launchApp requestPermissions');
const methods = words('getApp getState listApps listWindows getAXState getAXNodes getAXStateAndScreenshot getScreenshot getCoordinateInfo ocr click drag scroll typeText paste pressKey setValue selectText performSecondaryAction move hover cursorState hideCursor write emitImage log parse stringify map filter find findIndex some every forEach reduce split trim match matchAll test includes startsWith endsWith slice substring indexOf lastIndexOf replace replaceAll join toLowerCase toUpperCase toString round ceil floor abs min max isFinite isInteger');
const fields = words('length state nodes index parentIndex depth truncated screenshot coordinates windowId pid frame width height x y scaleX scaleY title name id app apps windows bundleId onScreen identifier role subrole label value actions focused enabled lines text rect range minX minY maxXExclusive maxYExclusive relative global mode unit success ok result error code message method verificationRequired valueVerified visualVerified button scrollDistance visibilityMode visible history selectedText selectedRange location verified');
const syntax = words('Program ExpressionStatement VariableDeclaration VariableDeclarator Identifier Literal AwaitExpression CallExpression MemberExpression ChainExpression ObjectExpression Property ArrayExpression SpreadElement ArrowFunctionExpression BinaryExpression LogicalExpression UnaryExpression ConditionalExpression TemplateLiteral TemplateElement AssignmentExpression UpdateExpression BlockStatement ReturnStatement IfStatement ForOfStatement ForStatement BreakStatement ContinueStatement EmptyStatement SequenceExpression');

export class BenchPolicyError extends Error {
  constructor(message, violation = false) {
    super(message);
    this.code = violation ? 'BENCH_GUI_ONLY' : 'BENCH_JS_SUBSET';
  }
}

function children(node) {
  return Object.values(node).flatMap(value => Array.isArray(value)
    ? value.filter(item => item?.type) : value?.type ? [value] : []);
}

// Restrict the benchmark's submitted JS to GUI calls and local data handling.
// The ordinary MCP REPL retains its trusted local Node semantics.
export function createGuiValidator() {
  const bindings = new Set(builtins);
  return code => {
    let program;
    try { program = parse(code, {ecmaVersion: 'latest', sourceType: 'module'}); }
    catch { throw new BenchPolicyError('Use valid JavaScript with direct cua/app calls.'); }

    const names = new Set(bindings);
    function collect(node) {
      const declared = node.type === 'VariableDeclarator' ? [node.id]
        : node.type === 'ArrowFunctionExpression' ? node.params : [];
      for (const id of declared) {
        if (id.type !== 'Identifier') throw new BenchPolicyError('Use simple named variables and parameters.');
        if (builtins.has(id.name) || forbidden.has(id.name)) throw new BenchPolicyError(`Reserved name: ${id.name}`, true);
        names.add(id.name);
      }
      children(node).forEach(collect);
    }
    function check(node) {
      if (!syntax.has(node.type)) {
        throw new BenchPolicyError(`Unsupported syntax: ${node.type}`, /Import|Export|MetaProperty/.test(node.type));
      }
      if (node.type === 'Identifier') {
        if (forbidden.has(node.name)) throw new BenchPolicyError(`Unavailable identifier: ${node.name}`, true);
        if (!names.has(node.name)) throw new BenchPolicyError(`Unknown variable: ${node.name}`);
      }
      if (node.type === 'Property') {
        if (node.method || node.computed || node.kind !== 'init' || forbidden.has(node.key.name ?? node.key.value)) {
          throw new BenchPolicyError('Use plain object data with static keys.', true);
        }
        check(node.value);
        return;
      }
      if (node.type === 'MemberExpression') {
        check(node.object);
        if (node.computed) {
          if (node.property.type !== 'Literal' || !Number.isSafeInteger(node.property.value) || node.property.value < 0) {
            throw new BenchPolicyError('Use named fields or literal array indices.', typeof node.property.value === 'string');
          }
        } else if (!methods.has(node.property.name) && !fields.has(node.property.name)) {
          throw new BenchPolicyError(`Unavailable field: ${node.property.name}`, forbidden.has(node.property.name) || blockedFields.has(node.property.name));
        }
        return;
      }
      if (node.type === 'CallExpression') {
        const callee = node.callee;
        check(callee);
        node.arguments.forEach(check);
        const allowed = callee.type === 'ArrowFunctionExpression' ||
          (callee.type === 'Identifier' && functions.has(callee.name)) ||
          (callee.type === 'MemberExpression' && !callee.computed && methods.has(callee.property.name));
        if (!allowed) {
          const name = callee.name ?? callee.property?.name;
          throw new BenchPolicyError('Use documented GUI calls or simple array and string functions.',
            forbidden.has(name) || blockedFields.has(name));
        }
        return;
      }
      const assigned = node.type === 'AssignmentExpression' ? node.left
        : node.type === 'UpdateExpression' ? node.argument : null;
      if (assigned && (assigned.type !== 'Identifier' || builtins.has(assigned.name))) {
        throw new BenchPolicyError('Only local variables may be assigned.', true);
      }
      children(node).forEach(check);
    }
    collect(program);
    check(program);
    // Top-level declarations persist across calls in the actual REPL.
    for (const statement of program.body) {
      if (statement.type === 'VariableDeclaration') for (const {id} of statement.declarations) bindings.add(id.name);
    }
  };
}
