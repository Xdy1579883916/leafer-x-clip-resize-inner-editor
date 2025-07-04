import type { IEditor } from '@leafer-in/interface'
import type { IObject, IUIEvent } from '@leafer-ui/interface'
import type { EditBox } from '../display/EditBox'
import { MathHelper } from '@leafer-ui/core'
import { EditDataHelper } from '../tool/EditDataHelper'

const cacheCursors: IObject = {}

export function updateCursor(editor: IEditor, editBox: EditBox, e: IUIEvent): void {
  const point = editBox.enterPoint
  if (!point || !editor.editing || !editBox.visible)
    return
  if (point.name === 'circle')
    return // 独立旋转按钮
  if (point.pointType === 'button') { // 普通按钮
    if (!point.cursor)
      point.cursor = 'pointer'
    return
  }

  let { rotation } = editBox
  const { resizeCursor, rotateCursor, skewCursor, resizeable, rotateable, skewable } = editor.mergeConfig
  const { pointType } = point
  const { flippedX, flippedY } = editBox

  let showResize = pointType.includes('resize')
  if (showResize && rotateable && (e.metaKey || e.ctrlKey || !resizeable))
    showResize = false
  const showSkew = skewable && !showResize && (point.name === 'resize-line' || pointType === 'skew')

  const cursor = showSkew ? skewCursor : (showResize ? resizeCursor : rotateCursor)
  rotation += (EditDataHelper.getFlipDirection(point.direction, flippedX, flippedY) + 1) * 45
  rotation = Math.round(MathHelper.formatRotation(rotation, true) / 2) * 2

  const { url, x, y } = cursor
  const key = url + rotation

  if (cacheCursors[key]) {
    point.cursor = cacheCursors[key]
  }
  else {
    cacheCursors[key] = point.cursor = { url: toDataURL(url, rotation), x, y }
  }
}

export function updateMoveCursor(editor: IEditor, editBox: EditBox): void {
  const { moveCursor } = editor.mergeConfig
  editBox.rect.cursor = moveCursor
}

function toDataURL(svg: string, rotation: number): string {
  return `"data:image/svg+xml,${encodeURIComponent(svg.replace('{{rotation}}', rotation.toString()))}"`
}
