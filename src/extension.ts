import * as cp from 'child_process'
import { dirname } from 'path'
import * as vscode from 'vscode'

const TIP = 'Please enter interface which you want to implement.'

export function activate(context: vscode.ExtensionContext) {
  const implProvider = new ImplProvider()
  const codeAction = vscode.languages.registerCodeActionsProvider('go', implProvider, {
    providedCodeActionKinds: ImplProvider.providedCodeActionKinds,
  })

  context.subscriptions.push(codeAction)
}

// implement
export class ImplProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix]
  private structAtLine = ''

  async provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range
  ): Promise<vscode.CodeAction[] | undefined> {
    if (this.isShow(document, range)) {
      return [new vscode.CodeAction(`Implement Interface Methods`, vscode.CodeActionKind.QuickFix)]
    }
  }

  resolveCodeAction(
    codeAction: vscode.CodeAction,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeAction> {
    const quickPick = vscode.window.createQuickPick()

    quickPick.placeholder = TIP

    let timeout: any = null
    let interfaces: vscode.QuickPickItem[]
    quickPick.onDidChangeValue(value => {
      if (value === undefined) {
        quickPick.placeholder = TIP
      }
      if (timeout !== null) {
        clearTimeout(timeout)
      }
      quickPick.busy = true
      timeout = setTimeout(async () => {
        interfaces = await this.getInterfaces(value)
        quickPick.items = interfaces
      }, 300)
      quickPick.busy = false
    })

    quickPick.onDidChangeSelection(value => {
      const editor = vscode.window.activeTextEditor!
      const root = dirname(editor.document.fileName)

      // 获取结构体名称

      // 实现接口方法
      let interfaceName = ''
      const { label, description } = value[0]
      description?.includes('/')
        ? (interfaceName = `${description}.${label}`)
        : (interfaceName = `${label}`)
      const command = `impl "${this.structAtLine.toLowerCase().charAt(0)} ${
        this.structAtLine
      }" ${interfaceName}`

      cp.exec(command, { cwd: root }, (err, stdout, stderr) => {
        if (err) {
          vscode.window.showErrorMessage(err.message)
          return
        }

        if (stderr) {
          vscode.window.showErrorMessage(stderr)
          return
        }

        vscode.commands
          .executeCommand('vscode.executeDocumentSymbolProvider', editor.document.uri)
          .then((obj: any) => {
            const struct = obj.filter(
              (item: vscode.SymbolInformation) => item.name === this.structAtLine
            )
            const reg = new RegExp(
              `${this.structAtLine.toLowerCase().charAt(0)} ${this.structAtLine}`,
              'g'
            )
            const out = stdout.replace(
              reg,
              `${this.structAtLine.toLowerCase().charAt(0)} $\{1|${this.structAtLine},*${
                this.structAtLine
              }|\}`
            )
            const snippet = new vscode.SnippetString('\n' + out)

            editor.insertSnippet(snippet, new vscode.Position(struct[0].range.e.c + 1, 0))
          })
      })
      quickPick.hide()
    })

    quickPick.onDidHide(() => {
      quickPick.dispose()
    })
    quickPick.show()

    return
  }

  // 何时显示提示
  private isShow(document: vscode.TextDocument, range: vscode.Range) {
    const line = document.lineAt(range.start.line)
    this.structAtLine = line.text.split(' ')[1]
    return line.text.includes('struct')
  }

  // 获取 interface 列表
  private getInterfaces = (keyword: string): Promise<vscode.QuickPickItem[]> => {
    return new Promise((resolve, reject) => {
      vscode.commands.executeCommand('vscode.executeWorkspaceSymbolProvider', keyword).then(obj => {
        const interfaces = (obj as vscode.SymbolInformation[]).filter(
          item => item.kind === vscode.SymbolKind.Interface
        )

        resolve(interfaces.map(item => ({ label: item.name, description: item.containerName })))
      })
    })
  }
}
