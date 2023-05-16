import * as cp from 'child_process'
import { dirname } from 'path'
import * as vscode from 'vscode'

const TIP = 'Please enter interface which you want to implement.'

export function activate(context: vscode.ExtensionContext) {
  const implProvider = new ImplProvider()
  const codeAction = vscode.languages.registerCodeActionsProvider('go', implProvider, {
    providedCodeActionKinds: ImplProvider.providedCodeActionKinds,
  })

  const command = vscode.commands.registerCommand('go-impl.quickpick', quickPick)

  context.subscriptions.push(codeAction, command)
}

// implement
export class ImplProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix]

  async provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range
  ): Promise<vscode.CodeAction[] | undefined> {
    if (!this.isShow(document, range)) {
      return
    }

    // 生成可选项
    const quickFix = new vscode.CodeAction(
      `Implement Interface Methods`,
      vscode.CodeActionKind.QuickFix
    )
    quickFix.command = { command: 'go-impl.quickpick', title: 'quickpick' }

    return [quickFix]
  }

  // 何时显示提示
  private isShow(document: vscode.TextDocument, range: vscode.Range) {
    const line = document.lineAt(range.start.line)
    return line.text.includes('struct')
  }
}

// 获取 interface 列表
const getInterfaces = (keyword: string): Promise<vscode.QuickPickItem[]> => {
  return new Promise((resolve, reject) => {
    vscode.commands.executeCommand('vscode.executeWorkspaceSymbolProvider', keyword).then(obj => {
      const interfaces = (obj as vscode.SymbolInformation[]).filter(
        item => item.kind === vscode.SymbolKind.Interface
      )

      resolve(interfaces.map(item => ({ label: item.name, description: item.containerName })))
    })
  })
}

// quickpick
const quickPick = () => {
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
      interfaces = await getInterfaces(value)
      quickPick.items = interfaces
    }, 300)
    quickPick.busy = false
  })

  quickPick.onDidChangeSelection(value => {
    const editor = vscode.window.activeTextEditor!
    const root = dirname(editor.document.fileName)

    // 获取结构体名称
    const position = editor.selection.active
    const line = editor.document.lineAt(position.line).text
    const param = line.split(' ')[1]

    // 实现接口方法
    let interfaceName = ''
    const { label, description } = value[0]
    description?.includes('/')
      ? (interfaceName = `${description}.${label}`)
      : (interfaceName = `${label}`)
    const command = `impl "${param.toLowerCase().charAt(0)} ${param}" ${interfaceName}`
    console.log('command:', command)
    cp.exec(command, { cwd: root }, async (err, stdout, stderr) => {
      if (err) {
        vscode.window.showErrorMessage(err.message)
        return
      }

      if (stderr) {
        vscode.window.showErrorMessage(stderr)
        return
      }

      const reg = new RegExp(`${param.toLowerCase().charAt(0)} ${param}`, 'g')
      const out = stdout.replace(reg, `${param.toLowerCase().charAt(0)} $\{1|${param},*${param}|\}`)
      const snippet = new vscode.SnippetString('\n' + out)

      await vscode.commands.executeCommand('cursorEnd')
      await vscode.commands.executeCommand('editor.action.jumpToBracket')

      editor.insertSnippet(snippet, new vscode.Position(position.line + 2, 0))
    })
    quickPick.hide()
  })

  quickPick.onDidHide(() => {
    quickPick.dispose()
  })
  quickPick.show()
}
