// @ts-check
import 'monaco-editor/esm/vs/editor/browser/controller/coreCommands';
import 'monaco-editor/esm/vs/editor/browser/widget/codeEditorWidget';
import 'monaco-editor/esm/vs/editor/browser/widget/diffEditorWidget';
import 'monaco-editor/esm/vs/editor/browser/widget/diffNavigator';
import 'monaco-editor/esm/vs/editor/contrib/bracketMatching/bracketMatching';
import 'monaco-editor/esm/vs/editor/contrib/caretOperations/caretOperations';
import 'monaco-editor/esm/vs/editor/contrib/caretOperations/transpose';
import 'monaco-editor/esm/vs/editor/contrib/clipboard/clipboard';
import 'monaco-editor/esm/vs/editor/contrib/codeAction/codeActionContributions';
import 'monaco-editor/esm/vs/editor/contrib/codelens/codelensController';
import 'monaco-editor/esm/vs/editor/contrib/colorPicker/colorDetector';
import 'monaco-editor/esm/vs/editor/contrib/comment/comment';
import 'monaco-editor/esm/vs/editor/contrib/contextmenu/contextmenu';
import 'monaco-editor/esm/vs/editor/contrib/cursorUndo/cursorUndo';
import 'monaco-editor/esm/vs/editor/contrib/dnd/dnd';
import 'monaco-editor/esm/vs/editor/contrib/find/findController';
import 'monaco-editor/esm/vs/editor/contrib/folding/folding';
import 'monaco-editor/esm/vs/editor/contrib/fontZoom/fontZoom';
import 'monaco-editor/esm/vs/editor/contrib/format/formatActions';
import 'monaco-editor/esm/vs/editor/contrib/goToDefinition/goToDefinitionCommands';
import 'monaco-editor/esm/vs/editor/contrib/goToDefinition/goToDefinitionMouse';
import 'monaco-editor/esm/vs/editor/contrib/gotoError/gotoError';
import 'monaco-editor/esm/vs/editor/contrib/hover/hover';
import 'monaco-editor/esm/vs/editor/contrib/inPlaceReplace/inPlaceReplace';
import 'monaco-editor/esm/vs/editor/contrib/linesOperations/linesOperations';
import 'monaco-editor/esm/vs/editor/contrib/links/links';
import 'monaco-editor/esm/vs/editor/contrib/multicursor/multicursor';
import 'monaco-editor/esm/vs/editor/contrib/parameterHints/parameterHints';
import 'monaco-editor/esm/vs/editor/contrib/referenceSearch/referenceSearch';
import 'monaco-editor/esm/vs/editor/contrib/rename/rename';
import 'monaco-editor/esm/vs/editor/contrib/smartSelect/smartSelect';
import 'monaco-editor/esm/vs/editor/contrib/snippet/snippetController2';
import 'monaco-editor/esm/vs/editor/contrib/suggest/suggestController';
import 'monaco-editor/esm/vs/editor/contrib/tokenization/tokenization';
import 'monaco-editor/esm/vs/editor/contrib/toggleTabFocusMode/toggleTabFocusMode';
import 'monaco-editor/esm/vs/editor/contrib/wordHighlighter/wordHighlighter';
import 'monaco-editor/esm/vs/editor/contrib/wordOperations/wordOperations';
import 'monaco-editor/esm/vs/editor/contrib/wordPartOperations/wordPartOperations';
import 'monaco-editor/esm/vs/editor/standalone/browser/accessibilityHelp/accessibilityHelp';
import 'monaco-editor/esm/vs/editor/standalone/browser/iPadShowKeyboard/iPadShowKeyboard';
import 'monaco-editor/esm/vs/editor/standalone/browser/inspectTokens/inspectTokens';
import 'monaco-editor/esm/vs/editor/standalone/browser/quickOpen/gotoLine';
import 'monaco-editor/esm/vs/editor/standalone/browser/quickOpen/quickCommand';
import 'monaco-editor/esm/vs/editor/standalone/browser/quickOpen/quickOutline';
import 'monaco-editor/esm/vs/editor/standalone/browser/referenceSearch/standaloneReferenceSearch';
import 'monaco-editor/esm/vs/editor/standalone/browser/toggleHighContrast/toggleHighContrast';

import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import * as rustConf from 'monaco-editor/esm/vs/basic-languages/rust/rust';
import exampleCode from './example-code';
import encoding from 'text-encoding';

if (typeof TextEncoder === "undefined") {
    // Edge polyfill, https://rustwasm.github.io/docs/wasm-bindgen/reference/browser-support.html
    self.TextEncoder = encoding.TextEncoder;
    self.TextDecoder = encoding.TextDecoder;
}

import './index.css';

const wasmDemo = import('wasm_demo');

self.MonacoEnvironment = {
    getWorkerUrl: () => './editor.worker.bundle.js',
};

const modeId = 'ra-rust'; // not "rust" to circumvent conflict
monaco.languages.register({ // language for editor
    id: modeId,
});
monaco.languages.register({ // language for hover info
    id: 'rust',
});

monaco.languages.onLanguage(modeId, async () => {
    const { WorldState } = await wasmDemo;

    const state = new WorldState();

    const [model] = monaco.editor.getModels();
    let allTokens = [];

    function update() {
        console.info('update');
        const res = state.update(model.getValue());
        monaco.editor.setModelMarkers(model, modeId, res.diagnostics);
        allTokens = res.highlights;
    }
    update();

    model.onDidChangeContent(update);

    monaco.languages.setLanguageConfiguration(modeId, rustConf.conf);
    monaco.languages.setLanguageConfiguration('rust', rustConf.conf);
    monaco.languages.setMonarchTokensProvider('rust', rustConf.language);

    monaco.languages.registerHoverProvider(modeId, {
        provideHover: (_, pos) => state.hover(pos.lineNumber, pos.column),
    });
    monaco.languages.registerCodeLensProvider(modeId, {
        provideCodeLenses(m) {
            const code_lenses = state.code_lenses();
            const lenses = code_lenses.map(({ range, command }) => {
                const position = {
                    column: range.startColumn,
                    lineNumber: range.startLineNumber,
                };

                const references = command.positions.map((pos) => ({ range: pos, uri: m.uri }));
                return {
                    range,
                    command: {
                        id: command.id,
                        title: command.title,
                        arguments: [
                            m.uri,
                            position,
                            references,
                        ],
                    },
                };
            });

            return { lenses, dispose() { } };
        },
    });
    monaco.languages.registerReferenceProvider(modeId, {
        provideReferences(m, pos, { includeDeclaration }) {
            const references = state.references(pos.lineNumber, pos.column, includeDeclaration);
            if (references) {
                return references.map(({ range }) => ({ uri: m.uri, range }));
            }
        },
    });
    monaco.languages.registerDocumentHighlightProvider(modeId, {
        provideDocumentHighlights: (_, pos) => state.references(pos.lineNumber, pos.column, true),
    });
    monaco.languages.registerRenameProvider(modeId, {
        provideRenameEdits: (m, pos, newName) => {
            const edits = state.rename(pos.lineNumber, pos.column, newName);
            if (edits) {
                return {
                    edits: [{
                        resource: m.uri,
                        edits,
                    }],
                };
            }
        },
        resolveRenameLocation: (_, pos) => state.prepare_rename(pos.lineNumber, pos.column),
    });
    monaco.languages.registerCompletionItemProvider(modeId, {
        triggerCharacters: [".", ":", "="],
        provideCompletionItems(m, pos) {
            const suggestions = state.completions(pos.lineNumber, pos.column);
            if (suggestions) {
                return { suggestions };
            }
        },
    });
    monaco.languages.registerSignatureHelpProvider(modeId, {
        signatureHelpTriggerCharacters: ['(', ','],
        provideSignatureHelp(m, pos) {
            const value = state.signature_help(pos.lineNumber, pos.column);
            if (!value) return null;
            return {
                value,
                dispose() { },
            };
        },
    });
    monaco.languages.registerDefinitionProvider(modeId, {
        provideDefinition(m, pos) {
            const list = state.definition(pos.lineNumber, pos.column);
            if (list) {
                return list.map(def => ({ ...def, uri: m.uri }));
            }
        },
    });
    monaco.languages.registerTypeDefinitionProvider(modeId, {
        provideTypeDefinition(m, pos) {
            const list = state.type_definition(pos.lineNumber, pos.column);
            if (list) {
                return list.map(def => ({ ...def, uri: m.uri }));
            }
        },
    });
    monaco.languages.registerImplementationProvider(modeId, {
        provideImplementation(m, pos) {
            const list = state.goto_implementation(pos.lineNumber, pos.column);
            if (list) {
                return list.map(def => ({ ...def, uri: m.uri }));
            }
        },
    });
    monaco.languages.registerDocumentSymbolProvider(modeId, {
        provideDocumentSymbols: () => state.document_symbols(),
    });
    monaco.languages.registerOnTypeFormattingEditProvider(modeId, {
        autoFormatTriggerCharacters: [".", "="],
        provideOnTypeFormattingEdits: (_, pos, ch) => state.type_formatting(pos.lineNumber, pos.column, ch),
    });
    monaco.languages.registerFoldingRangeProvider(modeId, {
        provideFoldingRanges: () => state.folding_ranges(),
    });

    class TokenState {
        constructor(line = 0) {
            this.line = line;
            this.equals = () => true;
        }

        clone() {
            const res = new TokenState(this.line);
            res.line += 1;
            return res;
        }
    }

    function fixTag(tag) {
        switch (tag) {
            case 'builtin': return 'variable.predefined';
            case 'attribute': return 'key';
            case 'macro': return 'number.hex';
            case 'literal': return 'number';
            default: return tag;
        }
    }

    monaco.languages.setTokensProvider(modeId, {
        getInitialState: () => new TokenState(),
        tokenize(_, st) {
            const filteredTokens = allTokens
                .filter((token) => token.range.startLineNumber === st.line);

            const tokens = filteredTokens.map((token) => ({
                startIndex: token.range.startColumn - 1,
                scopes: fixTag(token.tag),
            }));
            // add tokens inbetween highlighted ones to remove color artifacts
            tokens.push(...filteredTokens
                .filter((tok, i) => i === tokens.length - 1 || tokens[i + 1].startIndex > (tok.range.endColumn - 1))
                .map((token) => ({
                    startIndex: token.range.endColumn - 1,
                    scopes: 'operator',
                })));
            tokens.sort((a, b) => a.startIndex - b.startIndex);

            return {
                tokens,
                endState: new TokenState(st.line + 1),
            };
        },
    });
});

const myEditor = monaco.editor.create(document.body, {
    theme: 'vs-dark',
    value: exampleCode,
    language: modeId,
});

window.onresize = () => myEditor.layout();
