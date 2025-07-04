import type { IEditor, IEditPoint, IEditPointType, IMatrixData, IUIInputData } from '@leafer-in/interface'
import type { Direction9 } from '@leafer-ui/core'
import type {
  IAlign,
  IBoundsData,
  IBox,
  IBoxInputData,
  IEditorConfig,
  IEditorDragStartData,
  IEventListenerId,
  IGroup,
  IPointData,
  IRect,
  IUI,
  IUnitPointData,
} from '@leafer-ui/interface'
import type { ClipResizeEditor } from '../index'
import { AroundHelper, Box, DragEvent, Group, Image, Platform, PointerEvent, ResizeEvent } from '@leafer-ui/core'
import { updateCursor, updateMoveCursor } from '../editor/cursor'
import { EditDataHelper } from '../tool/EditDataHelper'
import { EditPoint } from './EditPoint'

const fourDirection = ['top', 'right', 'bottom', 'left']
const editConfig: IEditorConfig = undefined

// 横竖横竖
const lineDirectionData: IUnitPointData[] = [
  { x: 0, y: 0.33 },
  { x: 0.33, y: 0 },
  { x: 0, y: 0.66 },
  { x: 0.66, y: 0 },
]
lineDirectionData.forEach(item => item.type = 'percent')

interface IEditResizeStartData {
  inner: {
    transform_world: IMatrixData
  }
}

const svgOpt = { w: 24, h: 6, shadow: 2 }
function getPointSvgCenter() {
  const { w, h, shadow } = svgOpt
  return `<svg width="${w}" height="${h + shadow * 2}" viewBox="0 0 ${w} ${h + shadow}" style="filter: drop-shadow(0 0 2px rgba(0,0,0,0.3));" xmlns="http://www.w3.org/2000/svg">
    <rect x="${shadow / 2}" y="${shadow / 2}" width="${w - shadow}" height="${h}" rx="${h / 2}" ry="${h / 2}" fill="#fff" />
</svg>`
}
function getPointSvgOther(hasTop: boolean = true, hasLeft: boolean = true) {
  const { w, h, shadow } = svgOpt
  const top = hasTop ? `<rect x="${shadow}" y="${shadow}" width="${w - shadow}" height="${h}" rx="${h / 2}" ry="${h / 2}" fill="#fff" />` : ''
  const left = hasLeft ? `<rect x="${shadow}" y="${shadow}" width="${h}" height="${w - shadow}" rx="${h / 2}" ry="${h / 2}" fill="#fff" />` : ''
  return `<svg width="${w}" height="${w}" viewBox="0 0 ${w + shadow} ${w + shadow}" style="filter: drop-shadow(0 0 ${shadow}px rgba(0,0,0,0.3));" xmlns="http://www.w3.org/2000/svg">
      ${top} 
      ${left}
  </svg>`
}

export class EditBox extends Group {
  public editor: IEditor
  public clipResizeEditor: ClipResizeEditor
  public dragging: boolean
  public resizing: boolean
  public moving: boolean

  public view: IGroup = new Group() // 放置默认编辑工具控制点

  public rect: IBox = new Box({
    name: 'rect',
    hitFill: 'all',
    hitStroke: 'none',
    strokeAlign: 'center',
    hitRadius: 5,
  }) // target rect

  public circle: IEditPoint = new EditPoint({
    name: 'circle',
    strokeAlign: 'center',
    around: 'center',
    cursor: 'crosshair',
    hitRadius: 5,
  }) // rotate point

  public buttons: IGroup = new Group({ around: 'center', hitSelf: false, visible: 0 })

  public resizePoints: IEditPoint[] = [] // topLeft, top, topRight, right, bottomRight, bottom, bottomLeft, left
  public rotatePoints: IEditPoint[] = [] // topLeft, top, topRight, right, bottomRight, bottom, bottomLeft, left
  public resizeLines: IEditPoint[] = [] // top, right, bottom, left
  public guidelines: IEditPoint[] = [] // 两竖两横的参考线

  public enterPoint: IEditPoint
  public dragPoint: IEditPoint // 正在拖拽的控制点

  public dragStartData = {} as IEditorDragStartData
  public resizeStartData = {} as IEditResizeStartData

  // fliped
  public get flipped(): boolean {
    return this.flippedX || this.flippedY
  }

  public get flippedX(): boolean {
    return this.scaleX < 0
  }

  public get flippedY(): boolean {
    return this.scaleY < 0
  }

  public get flippedOne(): boolean {
    return this.scaleX * this.scaleY < 0
  }

  protected __eventIds: IEventListenerId[] = []

  constructor(editor: ClipResizeEditor) {
    super()
    this.clipResizeEditor = editor
    this.editor = editor.editor
    this.visible = false
    this.create()
    this.__listenEvents()
  }

  public create() {
    let rotatePoint: IEditPoint, resizeLine: IEditPoint, resizePoint: IEditPoint
    const { view, resizePoints, rotatePoints, resizeLines, rect, circle, buttons, guidelines } = this
    const arounds: IAlign[] = ['bottom-right', 'bottom', 'bottom-left', 'left', 'top-left', 'top', 'top-right', 'right']

    for (let i = 0; i < 8; i++) {
      rotatePoint = new EditPoint({ name: 'rotate-point', around: arounds[i], width: 15, height: 15, hitFill: 'all' })
      rotatePoints.push(rotatePoint)
      this.listenPointEvents(rotatePoint, 'rotate', i)

      if (i % 2) {
        resizeLine = new EditPoint({ name: 'resize-line', around: 'center', width: 10, height: 10, hitFill: 'all' })
        resizeLines.push(resizeLine)
        this.listenPointEvents(resizeLine, 'resize', i)
      }

      resizePoint = new EditPoint({ name: 'resize-point', hitRadius: 5 })
      resizePoints.push(resizePoint)
      this.listenPointEvents(resizePoint, 'resize', i)
    }

    // 添加 4 条参考线（两竖两横）
    for (let i = 0; i < 4; i++) {
      const isVertical = i % 2
      const line = new EditPoint({
        name: `guideline-${i}`,
        stroke: '#FFF',
        strokeWidth: 1,
        hitFill: 'none',
        visible: false, // 初始不可见，需要时显示
        width: isVertical ? 1 : 0, // 竖线宽度为1，横线宽度为0
        height: isVertical ? 0 : 1, // 横线高度为1，竖线高度为0
      })
      guidelines.push(line)
    }

    this.listenPointEvents(circle, 'rotate', 2)

    view.addMany(...rotatePoints, rect, circle, buttons, ...resizeLines, ...resizePoints, ...guidelines)
    this.add(view)
  }

  public load(): void {
    const { mergeConfig, single } = this.editor
    const { rect, circle, resizePoints } = this
    const { stroke, strokeWidth } = mergeConfig

    const pointsStyle = this.getPointsStyle()

    let resizeP: IRect

    for (let i = 0; i < 8; i++) {
      resizeP = resizePoints[i]
      const { w, h, shadow } = svgOpt
      if (i % 2) {
        const svg = new Image({
          name: 'resize-point-svg',
          url: Platform.toURL(getPointSvgCenter(), 'svg'),
          x: -(w) / 2,
          y: -(h - shadow / 2),
          width: w,
          height: h + shadow * 2,
        })
        resizeP.set({
          fill: '#ffffff00',
          resizeChildren: true,
          children: [svg],
          overflow: 'hide',
        })
        resizeP.rotation = 0
      }
      else {
        const svg = new Image({
          name: 'resize-point-svg',
          url: Platform.toURL(getPointSvgOther(true, true), 'svg'),
          x: -(h - shadow / 2),
          y: -(h - shadow / 2),
          width: w,
          height: w,
        })
        resizeP.set({
          fill: '#ffffff00',
          stroke: undefined,
          resizeChildren: true,
          children: [svg],
          overflow: 'hide',
        })
        resizeP.rotation = (i / 2) * 90
      }
    }

    // rotate
    circle.set(this.getPointStyle(mergeConfig.circle || mergeConfig.rotatePoint || pointsStyle[0]))

    // rect
    rect.set({ stroke, strokeWidth, editConfig, ...(mergeConfig.rect || {}) })
    rect.hittable = true
    rect.syncEventer = single && this.editor // 单选下 rect 的事件不会冒泡，需要手动传递给editor
  }

  public update(bounds: IBoundsData): void {
    const { guidelines, rect, circle, buttons, resizePoints, rotatePoints, resizeLines, editor } = this
    const { mergeConfig, element, multiple, editMask } = editor
    const { middlePoint, resizeable, rotateable, editBox, mask } = mergeConfig

    this.visible = !element.locked
    editMask.visible = mask ? true : 0

    if (this.view.worldOpacity) {
      const { width, height } = bounds
      const smallSize = svgOpt.w * 3 + svgOpt.shadow * 2
      const showPoints = editBox && !(width < smallSize && height < smallSize)

      const point = {} as IPointData
      let rotateP: IRect
      let resizeP: IRect
      let resizeL: IRect

      for (let i = 0; i < 8; i++) {
        AroundHelper.toPoint(AroundHelper.directionData[i], bounds, point)
        resizeP = resizePoints[i]
        rotateP = rotatePoints[i]
        resizeL = resizeLines[Math.floor(i / 2)]
        resizeP.set(point)
        rotateP.set(point)
        resizeL.set(point)

        // visible
        resizeP.visible = resizeL.visible = showPoints && !!(resizeable || rotateable)
        rotateP.visible = 0

        if (i % 2) { // top,  right, bottom, left
          resizeP.visible = showPoints && !!middlePoint

          if (((i + 1) / 2) % 2) { // top, bottom
            resizeL.width = width
            if (resizeP.width * 2 > width)
              resizeP.visible = false
          }
          else {
            resizeL.height = height
            resizeP.rotation = 90
            if (resizeP.width * 2 > height)
              resizeP.visible = false
          }
        }
      }

      // rotate
      circle.visible = true
      if (circle.visible)
        this.layoutCircle(mergeConfig)

      // rect
      if (rect.path)
        rect.path = null // line可能会变成path优先模式
      rect.set({ ...bounds, visible: multiple ? true : editBox })

      // buttons
      // eslint-disable-next-line style/no-mixed-operators
      buttons.visible = showPoints && buttons.children.length > 0 || 0
      if (buttons.visible)
        this.layoutButtons(mergeConfig)

      // 更新参考线位置（9宫格样式）
      guidelines.forEach((line, i) => {
        const isVertical = i % 2
        AroundHelper.toPoint(lineDirectionData[i], bounds, point)
        line.set({
          ...point,
          ...(isVertical ? { height } : { width }),
        })
      })
    }
    else {
      rect.set(bounds)
    } // 需要更新大小
  }

  protected layoutCircle(config: IEditorConfig): void {
    const { circleDirection, circleMargin, buttonsMargin, buttonsDirection, middlePoint } = config
    const direction = fourDirection.indexOf(circleDirection || ((this.buttons.children.length && buttonsDirection === 'bottom') ? 'top' : 'bottom'))
    this.setButtonPosition(this.circle, direction, circleMargin || buttonsMargin, !!middlePoint)
  }

  protected layoutButtons(config: IEditorConfig): void {
    const { buttons } = this
    const { buttonsDirection, buttonsFixed, buttonsMargin, middlePoint } = config

    const { flippedX, flippedY } = this
    let index = fourDirection.indexOf(buttonsDirection)
    if ((index % 2 && flippedX) || ((index + 1) % 2 && flippedY)) {
      if (buttonsFixed)
        index = (index + 2) % 4 // flip x / y
    }

    const direction = buttonsFixed ? EditDataHelper.getRotateDirection(index, this.flippedOne ? this.rotation : -this.rotation, 4) : index
    this.setButtonPosition(buttons, direction, buttonsMargin, !!middlePoint)

    if (buttonsFixed)
      buttons.rotation = (direction - index) * 90
    buttons.scaleX = flippedX ? -1 : 1
    buttons.scaleY = flippedY ? -1 : 1
  }

  protected setButtonPosition(buttons: IUI, direction: number, buttonsMargin: number, useMiddlePoint: boolean): void {
    const point = this.resizePoints[direction * 2 + 1] // 4 map 8 direction
    const useX = direction % 2 // left / right
    const sign = (!direction || direction === 3) ? -1 : 1 // top / left = -1

    const useWidth = direction % 2 // left / right  origin direction
    const margin = (buttonsMargin + (useWidth ? ((useMiddlePoint ? point.width : 0) + buttons.boxBounds.width) : ((useMiddlePoint ? point.height : 0) + buttons.boxBounds.height)) / 2) * sign

    if (useX) {
      buttons.x = point.x + margin
      buttons.y = point.y
    }
    else {
      buttons.x = point.x
      buttons.y = point.y + margin
    }
  }

  public unload(): void {
    this.visible = false
  }

  public getPointStyle(userStyle?: IBoxInputData): IBoxInputData {
    const { stroke, strokeWidth, pointFill, pointSize, pointRadius } = this.editor.mergeConfig
    const defaultStyle = {
      fill: pointFill,
      stroke,
      strokeWidth,
      around: 'center',
      strokeAlign: 'center',
      width: pointSize,
      height: pointSize,
      cornerRadius: pointRadius,
      offsetX: 0,
      offsetY: 0,
      editConfig,
    } as IBoxInputData
    return userStyle ? Object.assign(defaultStyle, userStyle) : defaultStyle
  }

  public getPointsStyle(): IBoxInputData[] {
    const { point } = this.editor.mergeConfig
    return Array.isArray(point) ? point : [point]
  }

  protected onDragStart(e: DragEvent): void {
    this.dragging = true
    const point = this.dragPoint = e.current as IEditPoint
    const { pointType } = point
    const { editor, clipResizeEditor, dragStartData } = this
    if (point.name === 'rect') {
      this.moving = true
      this.updateAllPoint({ opacity: 0 })
      this.updateAllLine({ visible: true })
    }
    let element
    if (pointType && pointType.includes('resize')) {
      ResizeEvent.resizingKeys = editor.leafList.keys // 记录正在resize中的元素列表
      element = clipResizeEditor.previewTarget
    }
    else {
      element = clipResizeEditor.previewInner
    }

    dragStartData.x = e.x
    dragStartData.y = e.y
    dragStartData.point = { x: element.x, y: element.y } // 用于移动
    dragStartData.bounds = { ...element.getLayoutBounds('box', 'local') } // 用于resize
    dragStartData.rotation = element.rotation // 用于旋转

    if (pointType && pointType.includes('rotate')) {
      this.updateAllLine({ visible: true })
    }
    if (pointType && pointType.includes('resize')) {
      this.resizing = true
      this.resizeStartData = {
        inner: {
          transform_world: { ...clipResizeEditor.clipInner.getTransform('world') },
        },
      }
    }
  }

  protected onDragEnd(e: DragEvent): void {
    this.dragging = false
    this.resizing = false
    this.moving = false
    this.dragPoint = null
    const { name, pointType } = e.current as IEditPoint
    if (name === 'rect') {
      this.updateAllPoint({ opacity: 1 })
      this.updateAllLine({ visible: false })
    }
    if (pointType && pointType.includes('resize'))
      ResizeEvent.resizingKeys = null

    if (pointType && pointType.includes('rotate')) {
      this.updateAllLine({ visible: false })
    }
  }

  updateAllPoint(data: IUIInputData) {
    [
      ...this.resizePoints,
      ...this.rotatePoints,
      ...this.resizeLines,
      this.circle,
    ].forEach(v => v.set(data))
  }

  updateAllLine(data: IUIInputData) {
    this.guidelines.forEach(v => v.set(data))
  }

  protected onDrag(e: DragEvent): void {
    const { editor, clipResizeEditor } = this
    const { pointType } = this.enterPoint = e.current as IEditPoint
    if (pointType.includes('rotate') || e.metaKey || e.ctrlKey || !editor.mergeConfig.resizeable) {
      clipResizeEditor.onRotate(e)
      if (pointType === 'resize-rotate') {
        clipResizeEditor.onScale(e)
      }
    }
    else if (pointType === 'resize') {
      clipResizeEditor.onScale(e)
    }
    updateCursor(editor, this, e)
  }

  public listenPointEvents(point: IEditPoint, type: IEditPointType, direction: Direction9): void {
    const { editor } = this
    point.direction = direction
    point.pointType = type
    point.on_(DragEvent.START, this.onDragStart, this)
    point.on_(DragEvent.DRAG, this.onDrag, this)
    point.on_(DragEvent.END, this.onDragEnd, this)
    point.on_(PointerEvent.LEAVE, () => this.enterPoint = null)
    if (point.name !== 'circle') {
      point.on_(PointerEvent.ENTER, (e) => {
        this.enterPoint = point
        updateCursor(editor, this, e)
      })
    }
  }

  protected __listenEvents(): void {
    const { rect, editor, clipResizeEditor } = this
    this.__eventIds = [
      rect.on_(DragEvent.START, this.onDragStart, this),
      rect.on_(DragEvent.DRAG, clipResizeEditor.onMove, clipResizeEditor),
      rect.on_(DragEvent.END, this.onDragEnd, this),
      rect.on_(PointerEvent.ENTER, () => updateMoveCursor(editor, this)),
    ]
  }

  protected __removeListenEvents(): void {
    this.off_(this.__eventIds)
    this.__eventIds.length = 0
  }

  public destroy(): void {
    this.editor = this.clipResizeEditor = null
    this.__removeListenEvents()
    super.destroy()
  }
}
