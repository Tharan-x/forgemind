// =============================================================================
// ForgeMind API — AST Symbol & Dependency Parser Service
// =============================================================================

import ts from 'typescript';

export interface ExtractedSymbol {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'enum' | 'struct' | string;
  startLine: number;
  endLine: number;
  exported: boolean;
}

export interface ExtractedDependency {
  targetPath: string;
  isExternal: boolean;
  importedSymbols: string[];
}

export interface ParsedSourceFile {
  symbols: ExtractedSymbol[];
  dependencies: ExtractedDependency[];
}

/**
 * Parses raw source code text using AST compiler trees to extract symbols and dependencies.
 *
 * Uses the official TypeScript Compiler API (ts.createSourceFile) for genuine AST parsing
 * of TypeScript, JavaScript, TSX, and JSX files.
 *
 * @param content Source code file text content.
 * @param language Primary language classification (e.g. 'TypeScript', 'Python').
 * @param filePath Relative repository file path for contextual hints.
 */
export function parseSourceFile(
  content: string,
  language: string | null,
  filePath: string,
): ParsedSourceFile {
  const symbols: ExtractedSymbol[] = [];
  const dependencies: ExtractedDependency[] = [];

  if (!content || !content.trim()) {
    return { symbols, dependencies };
  }

  const lang = (language || '').toLowerCase();

  if (
    lang.includes('typescript') ||
    lang.includes('javascript') ||
    lang.includes('tsx') ||
    lang.includes('jsx') ||
    filePath.endsWith('.ts') ||
    filePath.endsWith('.tsx') ||
    filePath.endsWith('.js') ||
    filePath.endsWith('.jsx')
  ) {
    parseTypeScriptAST(content, filePath, symbols, dependencies);
  } else if (lang.includes('python')) {
    parsePythonSource(content, symbols, dependencies);
  } else if (lang.includes('go')) {
    parseGoSource(content, symbols, dependencies);
  } else if (lang.includes('rust')) {
    parseRustSource(content, symbols, dependencies);
  } else if (lang.includes('java')) {
    parseJavaSource(content, symbols, dependencies);
  } else {
    parseGenericCodeSource(content, symbols, dependencies);
  }

  return { symbols, dependencies };
}

// ─── 1. Official TypeScript Compiler AST Engine ───────────────────────────────

function parseTypeScriptAST(
  content: string,
  filePath: string,
  symbols: ExtractedSymbol[],
  dependencies: ExtractedDependency[],
): void {
  const scriptTarget = ts.ScriptTarget.Latest;
  const scriptKind = filePath.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : filePath.endsWith('.jsx')
      ? ts.ScriptKind.JSX
      : filePath.endsWith('.ts')
        ? ts.ScriptKind.TS
        : ts.ScriptKind.JS;

  const sourceFile = ts.createSourceFile(filePath, content, scriptTarget, true, scriptKind);

  function getLineNumber(pos: number): number {
    return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
  }

  function hasExportModifier(node: ts.Node): boolean {
    if (!ts.canHaveModifiers(node)) return false;
    const modifiers = ts.getModifiers(node);
    return Boolean(
      modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword || m.kind === ts.SyntaxKind.DefaultKeyword,
      ),
    );
  }

  function visit(node: ts.Node): void {
    // A. Import Declarations AST
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (ts.isStringLiteral(moduleSpecifier)) {
        const targetPath = moduleSpecifier.text;
        const isExternal = !targetPath.startsWith('.') && !targetPath.startsWith('/');
        const importedSymbols: string[] = [];

        if (node.importClause) {
          if (node.importClause.name) {
            importedSymbols.push(node.importClause.name.text);
          }
          if (node.importClause.namedBindings) {
            const bindings = node.importClause.namedBindings;
            if (ts.isNamespaceImport(bindings)) {
              importedSymbols.push(bindings.name.text);
            } else if (ts.isNamedImports(bindings)) {
              bindings.elements.forEach((el) => {
                importedSymbols.push(el.name.text);
              });
            }
          }
        }

        dependencies.push({
          targetPath,
          isExternal,
          importedSymbols,
        });
      }
    }

    // B. Declarations & Symbol AST Nodes
    const exported = hasExportModifier(node);
    const startLine = getLineNumber(node.getStart(sourceFile));
    const endLine = getLineNumber(node.getEnd());

    if (ts.isFunctionDeclaration(node) && node.name) {
      symbols.push({
        name: node.name.text,
        kind: 'function',
        startLine,
        endLine,
        exported,
      });
    } else if (ts.isClassDeclaration(node) && node.name) {
      symbols.push({
        name: node.name.text,
        kind: 'class',
        startLine,
        endLine,
        exported,
      });
    } else if (ts.isInterfaceDeclaration(node) && node.name) {
      symbols.push({
        name: node.name.text,
        kind: 'interface',
        startLine,
        endLine,
        exported,
      });
    } else if (ts.isTypeAliasDeclaration(node) && node.name) {
      symbols.push({
        name: node.name.text,
        kind: 'type',
        startLine,
        endLine,
        exported,
      });
    } else if (ts.isEnumDeclaration(node) && node.name) {
      symbols.push({
        name: node.name.text,
        kind: 'enum',
        startLine,
        endLine,
        exported,
      });
    } else if (ts.isVariableStatement(node)) {
      const isVarExported = exported;
      node.declarationList.declarations.forEach((decl) => {
        if (ts.isIdentifier(decl.name)) {
          const kind =
            decl.initializer &&
            (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
              ? 'function'
              : 'variable';
          symbols.push({
            name: decl.name.text,
            kind,
            startLine: getLineNumber(decl.getStart(sourceFile)),
            endLine: getLineNumber(decl.getEnd()),
            exported: isVarExported,
          });
        }
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

// ─── 2. Python AST Helper ─────────────────────────────────────────────────────

function parsePythonSource(
  content: string,
  symbols: ExtractedSymbol[],
  dependencies: ExtractedDependency[],
): void {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const lineNum = i + 1;
    const line = lines[i]?.trim() ?? '';

    if (!line || line.startsWith('#')) continue;

    const fromImportMatch = line.match(/^from\s+([A-Za-z0-9_.]+)\s+import\s+([A-Za-z0-9_,\s*]+)/);
    if (fromImportMatch && fromImportMatch[1] && fromImportMatch[2]) {
      const targetPath = fromImportMatch[1];
      const isExternal = !targetPath.startsWith('.');
      const importedSymbols = fromImportMatch[2]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      dependencies.push({ targetPath, isExternal, importedSymbols });
      continue;
    }

    const importMatch = line.match(/^import\s+([A-Za-z0-9_.,\s]+)/);
    if (importMatch && importMatch[1]) {
      const pkgs = importMatch[1].split(',').map((p) => p.trim());
      pkgs.forEach((targetPath) => {
        if (targetPath) {
          dependencies.push({
            targetPath,
            isExternal: !targetPath.startsWith('.'),
            importedSymbols: [targetPath],
          });
        }
      });
      continue;
    }

    const funcMatch = line.match(/^def\s+([A-Za-z0-9_]+)\s*\(/);
    if (funcMatch && funcMatch[1]) {
      const name = funcMatch[1];
      symbols.push({
        name,
        kind: 'function',
        startLine: lineNum,
        endLine: lineNum,
        exported: !name.startsWith('_'),
      });
      continue;
    }

    const classMatch = line.match(/^class\s+([A-Za-z0-9_]+)/);
    if (classMatch && classMatch[1]) {
      const name = classMatch[1];
      symbols.push({
        name,
        kind: 'class',
        startLine: lineNum,
        endLine: lineNum,
        exported: !name.startsWith('_'),
      });
    }
  }
}

// ─── 3. Go Parser ─────────────────────────────────────────────────────────────

function parseGoSource(
  content: string,
  symbols: ExtractedSymbol[],
  dependencies: ExtractedDependency[],
): void {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const lineNum = i + 1;
    const line = lines[i]?.trim() ?? '';

    if (!line || line.startsWith('//')) continue;

    const singleImport = line.match(/^import\s+["']([^"']+)["']/);
    if (singleImport && singleImport[1]) {
      const targetPath = singleImport[1];
      dependencies.push({
        targetPath,
        isExternal: !targetPath.startsWith('.'),
        importedSymbols: [targetPath.split('/').pop() || targetPath],
      });
      continue;
    }

    const funcMatch = line.match(/^func\s+(?:\([^)]+\)\s+)?([A-Za-z0-9_]+)\s*\(/);
    if (funcMatch && funcMatch[1]) {
      const name = funcMatch[1];
      const isExported = name[0] === name[0]?.toUpperCase();
      symbols.push({
        name,
        kind: 'function',
        startLine: lineNum,
        endLine: lineNum,
        exported: isExported,
      });
      continue;
    }

    const typeMatch = line.match(/^type\s+([A-Za-z0-9_]+)\s+(?:struct|interface)/);
    if (typeMatch && typeMatch[1]) {
      const name = typeMatch[1];
      const isExported = name[0] === name[0]?.toUpperCase();
      symbols.push({
        name,
        kind: 'type',
        startLine: lineNum,
        endLine: lineNum,
        exported: isExported,
      });
    }
  }
}

// ─── 4. Rust Parser ───────────────────────────────────────────────────────────

function parseRustSource(
  content: string,
  symbols: ExtractedSymbol[],
  dependencies: ExtractedDependency[],
): void {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const lineNum = i + 1;
    const line = lines[i]?.trim() ?? '';

    if (!line || line.startsWith('//')) continue;

    const useMatch = line.match(/^use\s+([^;]+);/);
    if (useMatch && useMatch[1]) {
      const targetPath = useMatch[1].trim();
      dependencies.push({
        targetPath,
        isExternal: !targetPath.startsWith('crate') && !targetPath.startsWith('super'),
        importedSymbols: [targetPath.split('::').pop() || targetPath],
      });
      continue;
    }

    const isPub = line.startsWith('pub ');
    const fnMatch = line.match(/(?:pub\s+)?fn\s+([A-Za-z0-9_]+)/);
    if (fnMatch && fnMatch[1]) {
      symbols.push({
        name: fnMatch[1],
        kind: 'function',
        startLine: lineNum,
        endLine: lineNum,
        exported: isPub,
      });
      continue;
    }

    const structMatch = line.match(/(?:pub\s+)?(?:struct|enum|trait)\s+([A-Za-z0-9_]+)/);
    if (structMatch && structMatch[1]) {
      symbols.push({
        name: structMatch[1],
        kind: 'struct',
        startLine: lineNum,
        endLine: lineNum,
        exported: isPub,
      });
    }
  }
}

// ─── 5. Java Parser ───────────────────────────────────────────────────────────

function parseJavaSource(
  content: string,
  symbols: ExtractedSymbol[],
  dependencies: ExtractedDependency[],
): void {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const lineNum = i + 1;
    const line = lines[i]?.trim() ?? '';

    if (!line || line.startsWith('//')) continue;

    const importMatch = line.match(/^import\s+(?:static\s+)?([^;]+);/);
    if (importMatch && importMatch[1]) {
      const targetPath = importMatch[1].trim();
      dependencies.push({
        targetPath,
        isExternal: true,
        importedSymbols: [targetPath.split('.').pop() || targetPath],
      });
      continue;
    }

    const isPublic = line.startsWith('public ');
    const classMatch = line.match(
      /(?:public\s+)?(?:abstract\s+)?(?:class|interface|enum)\s+([A-Za-z0-9_]+)/,
    );
    if (classMatch && classMatch[1]) {
      symbols.push({
        name: classMatch[1],
        kind: 'class',
        startLine: lineNum,
        endLine: lineNum,
        exported: isPublic,
      });
    }
  }
}

// ─── 6. Generic Fallback Parser ───────────────────────────────────────────────

function parseGenericCodeSource(
  content: string,
  symbols: ExtractedSymbol[],
  _dependencies: ExtractedDependency[],
): void {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const lineNum = i + 1;
    const line = lines[i]?.trim() ?? '';

    if (!line || line.startsWith('//') || line.startsWith('#')) continue;

    const funcMatch = line.match(/(?:function|def|fn|func)\s+([A-Za-z0-9_$]+)/);
    if (funcMatch && funcMatch[1]) {
      symbols.push({
        name: funcMatch[1],
        kind: 'function',
        startLine: lineNum,
        endLine: lineNum,
        exported: line.includes('export') || line.includes('public') || line.includes('pub'),
      });
      continue;
    }

    const classMatch = line.match(/(?:class|interface|struct)\s+([A-Za-z0-9_$]+)/);
    if (classMatch && classMatch[1]) {
      symbols.push({
        name: classMatch[1],
        kind: 'class',
        startLine: lineNum,
        endLine: lineNum,
        exported: line.includes('export') || line.includes('public') || line.includes('pub'),
      });
    }
  }
}
