class AnnotationApp {
    // ثوابت استاتیک برای نام ابزارها
    static TOOL_PEN = "pen";
    static TOOL_HIGHLIGHTER = "highlighter";
    static TOOL_ERASER = "eraser";

    // ثوابت استاتیک برای حالت‌های تعامل
    static INTERACTION_STATE_IDLE = "idle";
    static INTERACTION_STATE_DRAWING = "drawing";
    static INTERACTION_STATE_MULTI_TOUCH_START = "multi_touch_start";
    static INTERACTION_STATE_PANNING = "panning";


    constructor(targetContainerSelector) {
        this.targetContainer = document.querySelector(targetContainerSelector);
        if (!this.targetContainer) {
            console.error("AnnotationApp: کانتینر هدف یافت نشد:", targetContainerSelector);
            return;
        }

        this._ensureRelativePosition();
        this._initializeProperties();
        this._initializeStorageKey();
        this._initializeIcons();

        if (this.targetContainer) {
            this.init();
        }
    }

    _ensureRelativePosition() {
        if (getComputedStyle(this.targetContainer).position === "static") {
            this.targetContainer.style.position = "relative";
        }
    }

    _initializeProperties() {
        this.PAN_MOVE_THRESHOLD = 15;
        this.HIGHLIGHTER_OPACITY = 0.4;
        this.TWO_FINGER_TAP_TIMEOUT = 300;

        this.canvas = null; this.ctx = null;
        this.committedCanvas = null; this.committedCtx = null;
        this.virtualCanvasContainer = null;

        this.viewportWidth = 0; this.viewportHeight = 0;
        this.scrollOffsetX = 0; this.scrollOffsetY = 0;
        this.totalWidth = 0; this.totalHeight = 0;

        this.isDrawing = false;
        this.noteModeActive = false;
        this.currentTool = AnnotationApp.TOOL_PEN;
        this.currentPath = null;
        this.drawings = [];

        this.penColor = "#000000";
        this.penLineWidth = 2; // مقدار اولیه ضخامت قلم (تغییر یافته توسط کاربر)
        this.highlighterColor = "#00ff00"; // (تغییر یافته توسط کاربر)
        this.highlighterLineWidth = 20;
        this.eraserWidth = 15;

        this.animationFrameRequestId = null;
        this._boundUpdateVirtualCanvas = this.updateVirtualCanvas.bind(this);

        this.interactionState = AnnotationApp.INTERACTION_STATE_IDLE;
        this.touchStartTimestamp = 0;
        this.panStartFinger1 = null; this.panStartFinger2 = null;
        this.lastPanMidX = null; this.lastPanMidY = null;
        this.initialTouchMidPoint = null;
        this.twoFingerTapProcessedInCurrentSequence = false;
    }

    _initializeStorageKey() {
        const baseStorageKey = "pageAnnotations";
        const pageIdentifier = window.location.pathname.replace(/[^a-zA-Z0-9_-]/g, "_");
        this.storageKey = `${baseStorageKey}_${pageIdentifier}`;
    }

    _initializeIcons() {
        this.icons = {
            [AnnotationApp.TOOL_PEN]: '<span class="material-symbols-outlined">stylus_note</span>',
            [AnnotationApp.TOOL_HIGHLIGHTER]: '<span class="material-symbols-outlined">format_ink_highlighter</span>',
            [AnnotationApp.TOOL_ERASER]: '<span class="material-symbols-outlined">ink_eraser</span>',
        };
    }

    init() {
        this.createVirtualCanvasContainer();
        this.createCanvases();
        this.createToolbar();
        this.addEventListeners();
        this.loadDrawings();
        this.updateVirtualCanvas();
        this.selectTool(AnnotationApp.TOOL_PEN);
    }

    createVirtualCanvasContainer() {
        this.virtualCanvasContainer = document.createElement("div");
        Object.assign(this.virtualCanvasContainer.style, {
            position: "fixed", top: "0", left: "0", width: "100vw", height: "100vh",
            pointerEvents: "none", zIndex: "1000", overflow: "hidden"
        });
        document.body.appendChild(this.virtualCanvasContainer);
    }

    createCanvases() {
        this.canvas = document.createElement("canvas");
        this.canvas.id = "annotationCanvas";
        Object.assign(this.canvas.style, {
            position: "absolute", top: "0", left: "0", zIndex: "1000",
            pointerEvents: "none", mixBlendMode: "multiply"
        });
        this.virtualCanvasContainer.appendChild(this.canvas);
        this.ctx = this.canvas.getContext("2d");

        this.committedCanvas = document.createElement("canvas");
        this.committedCtx = this.committedCanvas.getContext("2d");
    }

    _createStyledButton(id, title, innerHTML, className = "tool-button") {
        const button = document.createElement("button");
        button.id = id;
        button.title = title;
        button.className = className;
        if (innerHTML) button.innerHTML = innerHTML;
        return button;
    }

    createToolbar() {
        this._createMasterToggleButton();
        this._createToolsPanel();
        this._createToolButtons();
        this._createAllToolSettings();
        this._createClearButton();
        this.targetContainer.appendChild(this.toolsPanel);
        this.updateToolSettingsVisibility();
    }

    _createMasterToggleButton() {
        this.masterAnnotationToggleBtn = this._createStyledButton("masterAnnotationToggleBtn", "NOTE - فعال/غیرفعال کردن یادداشت‌برداری", "NOTE ✏️", "");
        Object.assign(this.masterAnnotationToggleBtn.style, { top: "5px", right: "5px" });
        this.targetContainer.appendChild(this.masterAnnotationToggleBtn);
    }

    _createToolsPanel() {
        this.toolsPanel = document.createElement("div");
        this.toolsPanel.id = "annotationToolsPanel";
        Object.assign(this.toolsPanel.style, {
            display: "none", flexDirection: "column", top: "45px", right: "5px"
        });
    }

    _createToolButtons() {
        const toolsGroup = document.createElement("div");
        toolsGroup.className = "toolbar-group";
        this.penBtn = this._createStyledButton("penBtn", "قلم", this.icons[AnnotationApp.TOOL_PEN]);
        this.highlighterBtn = this._createStyledButton("highlighterBtn", "هایلایتر", this.icons[AnnotationApp.TOOL_HIGHLIGHTER]);
        this.eraserBtn = this._createStyledButton("eraserBtn", "پاک‌کن", this.icons[AnnotationApp.TOOL_ERASER]);
        toolsGroup.append(this.penBtn, this.highlighterBtn, this.eraserBtn);
        this.toolsPanel.appendChild(toolsGroup);
    }

    _createToolSettingUI(toolKey, colorPropName, colorPickerRefName, lineWidthPropName, lineWidthDisplayRefName, lineWidthContainerRefName, minLineWidth, maxLineWidth, titleSuffix = "") {
        const settingsGroup = document.createElement("div");
        settingsGroup.className = "toolbar-group setting-group";
        settingsGroup.id = `${toolKey}SettingsGroup`;

        const colorLabel = document.createElement("label");
        this[colorPickerRefName] = document.createElement("input");
        this[colorPickerRefName].type = "color";
        this[colorPickerRefName].value = this[colorPropName];
        this[colorPickerRefName].title = `انتخاب رنگ ${titleSuffix}`;

        const lineWidthLabel = document.createElement("label");
        this[lineWidthContainerRefName] = document.createElement('div');
        this[lineWidthContainerRefName].className = 'line-width-slider-container';
        this[lineWidthContainerRefName].title = `برای تغییر ضخامت ${titleSuffix}، بکشید`;
        Object.assign(this[lineWidthContainerRefName].style, {
            display: 'flex', alignItems: 'center', cursor: 'ew-resize',
            padding: '2px 5px', border: '1px solid #ccc', borderRadius: '4px', userSelect: 'none'
        });

        const lessThanSpan = document.createElement('span'); lessThanSpan.textContent = '<'; lessThanSpan.className = 'line-width-arrow'; lessThanSpan.style.margin = '0 1px';
        this[lineWidthDisplayRefName] = document.createElement('span'); this[lineWidthDisplayRefName].className = 'line-width-value-display'; this[lineWidthDisplayRefName].textContent = this[lineWidthPropName]; Object.assign(this[lineWidthDisplayRefName].style, { textAlign: 'center', fontWeight: 'bold' });
        const greaterThanSpan = document.createElement('span'); greaterThanSpan.textContent = '>'; greaterThanSpan.className = 'line-width-arrow'; greaterThanSpan.style.margin = '0 1px';

        this[lineWidthContainerRefName].append(lessThanSpan, this[lineWidthDisplayRefName], greaterThanSpan);
        settingsGroup.append(colorLabel, this[colorPickerRefName], lineWidthLabel, this[lineWidthContainerRefName]);
        this.toolsPanel.appendChild(settingsGroup);

        this._addDragLogic(this[lineWidthContainerRefName], (newValue) => {
            this[lineWidthPropName] = Math.max(minLineWidth, Math.min(maxLineWidth, newValue));
            this[lineWidthDisplayRefName].textContent = this[lineWidthPropName];
        }, () => this[lineWidthPropName], minLineWidth, maxLineWidth);

        if (this[colorPickerRefName]) {
            this[colorPickerRefName].addEventListener("input", (e) => {
                this[colorPropName] = e.target.value;
            });
        }
    }

    _createAllToolSettings() {
        this._createToolSettingUI(AnnotationApp.TOOL_PEN, "penColor", "penColorPicker", "penLineWidth", "penLineWidthDisplay", "penLineWidthContainer", 1, 20, "قلم");
        this._createToolSettingUI(AnnotationApp.TOOL_HIGHLIGHTER, "highlighterColor", "highlighterColorPicker", "highlighterLineWidth", "highlighterLineWidthDisplay", "highlighterLineWidthContainer", 5, 50, "هایلایتر");
    }

    _addDragLogic(element, setterCallback, getterCallback, min, max, sensitivityFactor = 10) {
        let isDragging = false; let startX; let startValue;
        const onDragStart = (clientX) => { isDragging = true; startX = clientX; startValue = getterCallback(); element.classList.add('dragging'); document.body.style.cursor = 'ew-resize'; };
        const onDragMove = (clientX) => { if (!isDragging) return; const deltaX = clientX - startX; const newValue = Math.round(startValue + (deltaX / sensitivityFactor)); setterCallback(newValue); };
        const onDragEnd = () => { if (!isDragging) return; isDragging = false; element.classList.remove('dragging'); document.body.style.cursor = 'default'; document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); document.removeEventListener('touchmove', handleTouchMove); document.removeEventListener('touchend', handleTouchEnd); document.removeEventListener('touchcancel', handleTouchEnd); };
        const handleMouseDown = (e) => { e.preventDefault(); onDragStart(e.clientX); document.addEventListener('mousemove', handleMouseMove); document.addEventListener('mouseup', handleMouseUp); };
        const handleMouseMove = (e) => { e.preventDefault(); onDragMove(e.clientX); };
        const handleMouseUp = () => { onDragEnd(); };
        const handleTouchStart = (e) => { if (e.touches.length === 1) { e.preventDefault(); onDragStart(e.touches[0].clientX); document.addEventListener('touchmove', handleTouchMove, { passive: false }); document.addEventListener('touchend', handleTouchEnd); document.addEventListener('touchcancel', handleTouchEnd); } };
        const handleTouchMove = (e) => { if (e.touches.length === 1) { e.preventDefault(); onDragMove(e.touches[0].clientX); } };
        const handleTouchEnd = () => { onDragEnd(); };
        element.addEventListener('mousedown', handleMouseDown);
        element.addEventListener('touchstart', handleTouchStart, { passive: false });
    }

    _createClearButton() {
        this.clearBtn = this._createStyledButton("clearAnnotationsBtn", "پاک کردن تمام یادداشت‌ها", "پاک کردن همه", "");
        this.toolsPanel.appendChild(this.clearBtn);
    }

    updateToolSettingsVisibility() {
        const penSettings = document.getElementById(`${AnnotationApp.TOOL_PEN}SettingsGroup`);
        const highlighterSettings = document.getElementById(`${AnnotationApp.TOOL_HIGHLIGHTER}SettingsGroup`);
        if (penSettings) penSettings.style.display = (this.currentTool === AnnotationApp.TOOL_PEN && this.noteModeActive) ? "flex" : "none";
        if (highlighterSettings) highlighterSettings.style.display = (this.currentTool === AnnotationApp.TOOL_HIGHLIGHTER && this.noteModeActive) ? "flex" : "none";
        if (this.clearBtn) this.clearBtn.style.display = (this.currentTool === AnnotationApp.TOOL_ERASER && this.noteModeActive) ? "block" : "none";
    }

    updateVirtualCanvas() {
        const dimensionsChanged = this._calculateAndUpdateDimensions();
        if (dimensionsChanged) this._resizeCanvases();
        this.renderVisibleCanvasRegion();
    }

    _calculateAndUpdateDimensions() {
        const oldDims = { w: this.viewportWidth, h: this.viewportHeight, sx: this.scrollOffsetX, sy: this.scrollOffsetY, tw: this.totalWidth, th: this.totalHeight };
        this.viewportWidth = window.innerWidth; this.viewportHeight = window.innerHeight;
        this.scrollOffsetX = window.pageXOffset || document.documentElement.scrollLeft;
        this.scrollOffsetY = window.pageYOffset || document.documentElement.scrollTop;
        this.totalWidth = Math.max(document.body.scrollWidth, document.documentElement.scrollWidth, this.targetContainer.scrollWidth);
        this.totalHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, this.targetContainer.scrollHeight);
        return oldDims.w !== this.viewportWidth || oldDims.h !== this.viewportHeight || oldDims.sx !== this.scrollOffsetX || oldDims.sy !== this.scrollOffsetY || oldDims.tw !== this.totalWidth || oldDims.th !== this.totalHeight;
    }

    _resizeCanvases() {
        this.canvas.width = this.viewportWidth; this.canvas.height = this.viewportHeight;
        Object.assign(this.canvas.style, { width: `${this.viewportWidth}px`, height: `${this.viewportHeight}px` });
        if (this.committedCanvas.width !== this.totalWidth || this.committedCanvas.height !== this.totalHeight) {
            this.committedCanvas.width = this.totalWidth; this.committedCanvas.height = this.totalHeight;
            this.redrawCommittedDrawings();
        }
    }

    addEventListeners() {
        window.addEventListener("resize", this._boundUpdateVirtualCanvas);
        window.addEventListener("scroll", this._boundUpdateVirtualCanvas);
        const touchOptions = { passive: false };
        this.canvas.addEventListener("touchstart", this._handleTouchStart.bind(this), touchOptions);
        this.canvas.addEventListener("touchmove", this._handleTouchMove.bind(this), touchOptions);
        this.canvas.addEventListener("touchend", this._handleTouchEnd.bind(this), touchOptions);
        this.canvas.addEventListener("touchcancel", this._handleTouchEnd.bind(this), touchOptions);
        this.canvas.addEventListener("mousedown", this._handleMouseStart.bind(this));
        this.canvas.addEventListener("mousemove", this._handleMouseMove.bind(this));
        this.canvas.addEventListener("mouseup", this._handleMouseEnd.bind(this));
        this.canvas.addEventListener("mouseleave", (e) => this._handleMouseEnd(e, true));
        this._addUIEventListeners();
    }

    _addUIEventListeners() {
        this.masterAnnotationToggleBtn.addEventListener("click", () => this.toggleMasterAnnotationMode());
        this.penBtn.addEventListener("click", () => this.selectTool(AnnotationApp.TOOL_PEN));
        this.highlighterBtn.addEventListener("click", () => this.selectTool(AnnotationApp.TOOL_HIGHLIGHTER));
        this.eraserBtn.addEventListener("click", () => this.selectTool(AnnotationApp.TOOL_ERASER));
        this.clearBtn.addEventListener("click", () => this.clearAllAnnotations());
    }

    _handleMouseStart(event) {
        if (!this.noteModeActive || event.button !== 0) return;
        event.preventDefault();
        this.isDrawing = true;
        const { x, y } = this._getEventCoordinates(event);
        this.currentPath = this._createNewDrawingPath(x, y);
    }

    _handleMouseMove(event) {
        if (!this.isDrawing || !this.noteModeActive) return;
        event.preventDefault();
        const { x, y } = this._getEventCoordinates(event);
        if (this.currentPath) {
            this._updateCurrentDrawingPath(x, y);
            this._requestRenderFrameForLivePath();
        }
    }

    _handleMouseEnd(event, mouseLeftCanvas = false) {
        if (!this.isDrawing && !mouseLeftCanvas) return;
        if (this.isDrawing) {
            this._cancelRenderFrame();
            if (this.currentPath && this.currentPath.points.length > 0) {
                 this._processAndCommitCompletedPath();
            }
            this._resetDrawingStateAndClearLivePath();
        }
         if (mouseLeftCanvas) {
            this._resetDrawingStateAndClearLivePath();
        }
    }

    _handleTouchStart(event) {
        if (!this.noteModeActive) return;
        event.preventDefault();
        const touches = event.touches;
        if (touches.length === 1) {
            if (this.interactionState === AnnotationApp.INTERACTION_STATE_PANNING) return;
            this.interactionState = AnnotationApp.INTERACTION_STATE_DRAWING;
            this.isDrawing = true;
            const { x, y } = this._getEventCoordinates(touches[0]);
            this.currentPath = this._createNewDrawingPath(x, y);
            this.twoFingerTapProcessedInCurrentSequence = false;
        } else if (touches.length === 2) {
            this._resetDrawingStateAndClearLivePath();
            this.interactionState = AnnotationApp.INTERACTION_STATE_MULTI_TOUCH_START;
            this.touchStartTimestamp = Date.now();
            this.panStartFinger1 = { clientX: touches[0].clientX, clientY: touches[0].clientY };
            this.panStartFinger2 = { clientX: touches[1].clientX, clientY: touches[1].clientY };
            this.lastPanMidX = (touches[0].clientX + touches[1].clientX) / 2;
            this.lastPanMidY = (touches[0].clientY + touches[1].clientY) / 2;
            this.initialTouchMidPoint = { x: this.lastPanMidX, y: this.lastPanMidY };
        }
    }

    _handleTouchMove(event) {
        if (!this.noteModeActive) return;
        event.preventDefault();
        const touches = event.touches;
        if (this.interactionState === AnnotationApp.INTERACTION_STATE_DRAWING && touches.length === 1) {
            const { x, y } = this._getEventCoordinates(touches[0]);
            if (this.currentPath) {
                this._updateCurrentDrawingPath(x, y);
                this._requestRenderFrameForLivePath();
            }
        } else if (this.interactionState === AnnotationApp.INTERACTION_STATE_MULTI_TOUCH_START && touches.length === 2) {
            const currentMidX = (touches[0].clientX + touches[1].clientX) / 2;
            const currentMidY = (touches[0].clientY + touches[1].clientY) / 2;
            const deltaX = currentMidX - this.initialTouchMidPoint.x;
            const deltaY = currentMidY - this.initialTouchMidPoint.y;
            if (Math.sqrt(deltaX * deltaX + deltaY * deltaY) > this.PAN_MOVE_THRESHOLD) {
                this.interactionState = AnnotationApp.INTERACTION_STATE_PANNING;
            }
        } else if (this.interactionState === AnnotationApp.INTERACTION_STATE_PANNING && touches.length === 2) {
            const currentMidX = (touches[0].clientX + touches[1].clientX) / 2;
            const currentMidY = (touches[0].clientY + touches[1].clientY) / 2;
            const deltaScrollX = currentMidX - this.lastPanMidX;
            const deltaScrollY = currentMidY - this.lastPanMidY;
            window.scrollBy(-deltaScrollX, -deltaScrollY);
            this.lastPanMidX = currentMidX; this.lastPanMidY = currentMidY;
        }
    }

    _handleTouchEnd(event) {
        if (!this.noteModeActive) return;
        const touches = event.touches;
        if (this.interactionState === AnnotationApp.INTERACTION_STATE_DRAWING) {
            if (touches.length === 0) {
                this._cancelRenderFrame();
                if (this.currentPath && this.currentPath.points.length > 0) {
                    this._processAndCommitCompletedPath();
                }
                this._resetDrawingStateAndClearLivePath();
                this.interactionState = AnnotationApp.INTERACTION_STATE_IDLE;
            }
        } else if (this.interactionState === AnnotationApp.INTERACTION_STATE_MULTI_TOUCH_START) {
            const timeElapsed = Date.now() - this.touchStartTimestamp;
            if (timeElapsed < this.TWO_FINGER_TAP_TIMEOUT && !this.twoFingerTapProcessedInCurrentSequence) {
                this.undoLastDrawing();
                this.twoFingerTapProcessedInCurrentSequence = true;
            }
            if (touches.length < 2) {
                 this.interactionState = AnnotationApp.INTERACTION_STATE_IDLE;
                 this._resetTouchPanState();
            }
        } else if (this.interactionState === AnnotationApp.INTERACTION_STATE_PANNING) {
            if (touches.length < 2) {
                this.interactionState = AnnotationApp.INTERACTION_STATE_IDLE;
                this._resetTouchPanState();
            }
        }
        if (touches.length === 0) {
            this.interactionState = AnnotationApp.INTERACTION_STATE_IDLE;
            this._resetTouchPanState();
            this._resetDrawingStateAndClearLivePath();
        }
    }

    _resetTouchPanState() {
        this.panStartFinger1 = null; this.panStartFinger2 = null;
        this.lastPanMidX = null; this.lastPanMidY = null;
        this.initialTouchMidPoint = null;
    }

    undoLastDrawing() {
        if (this.drawings.length > 0) {
            this.drawings.pop();
            this.redrawCommittedDrawings();
            this.renderVisibleCanvasRegion();
            this.saveDrawings();
            console.log("AnnotationApp: آخرین یادداشت بازگردانده شد.");
        }
    }

    toggleMasterAnnotationMode() {
        this.noteModeActive = !this.noteModeActive;
        if (this.noteModeActive) this._activateAnnotationMode();
        else this._deactivateAnnotationMode();
        this.updateToolSettingsVisibility();
    }

    _activateAnnotationMode() {
        this.canvas.style.pointerEvents = "auto";
        document.body.classList.add("annotation-active");
        this.targetContainer.classList.add("annotation-active");
        this.masterAnnotationToggleBtn.textContent = "NOTE ✏️ (فعال)";
        this.masterAnnotationToggleBtn.classList.add("active");
        this.toolsPanel.style.display = "flex";
        if (!this.currentTool) this.selectTool(AnnotationApp.TOOL_PEN);
        console.log("AnnotationApp: حالت یادداشت‌برداری فعال شد.");
    }

    _deactivateAnnotationMode() {
        this.canvas.style.pointerEvents = "none";
        document.body.classList.remove("annotation-active");
        this.targetContainer.classList.remove("annotation-active");
        this.masterAnnotationToggleBtn.textContent = "NOTE ✏️ (غیرفعال)";
        this.masterAnnotationToggleBtn.classList.remove("active");
        this.toolsPanel.style.display = "none";
        this._resetDrawingStateAndClearLivePath();
        this.interactionState = AnnotationApp.INTERACTION_STATE_IDLE;
        console.log("AnnotationApp: حالت یادداشت‌برداری غیرفعال شد.");
    }

    _resetDrawingStateAndClearLivePath() {
        this.isDrawing = false; this.currentPath = null;
        this._cancelRenderFrame(); this.renderVisibleCanvasRegion();
    }

    _getEventCoordinates(eventOrTouch) {
        const clientX = eventOrTouch.clientX;
        const clientY = eventOrTouch.clientY;
        return { x: clientX + this.scrollOffsetX, y: clientY + this.scrollOffsetY };
    }

    _createNewDrawingPath(x, y) {
        const path = { tool: this.currentTool, points: [{ x, y }] };
        switch (this.currentTool) {
            case AnnotationApp.TOOL_PEN: Object.assign(path, { color: this.penColor, lineWidth: this.penLineWidth, opacity: 1.0 }); break;
            case AnnotationApp.TOOL_HIGHLIGHTER: Object.assign(path, { color: this.highlighterColor, lineWidth: this.highlighterLineWidth, opacity: this.HIGHLIGHTER_OPACITY }); break;
            case AnnotationApp.TOOL_ERASER: path.lineWidth = this.eraserWidth; break;
        }
        return path;
    }

    _updateCurrentDrawingPath(x, y) {
        if (this.currentTool === AnnotationApp.TOOL_HIGHLIGHTER) {
            if (this.currentPath.points.length <= 1) this.currentPath.points.push({ x, y });
            else this.currentPath.points[1] = { x, y };
        } else {
            this.currentPath.points.push({ x, y });
        }
    }

    _requestRenderFrameForLivePath() {
        if (this.animationFrameRequestId === null) {
            this.animationFrameRequestId = requestAnimationFrame(() => {
                this.renderVisibleCanvasRegion();
                this.animationFrameRequestId = null;
            });
        }
    }

    _cancelRenderFrame() {
        if (this.animationFrameRequestId !== null) {
            cancelAnimationFrame(this.animationFrameRequestId);
            this.animationFrameRequestId = null;
        }
    }

    _processAndCommitCompletedPath() {
        if (!this.currentPath || this.currentPath.points.length === 0) return;
        if (this.currentTool === AnnotationApp.TOOL_HIGHLIGHTER) this._finalizeHighlighterPath();
        if (this.currentTool === AnnotationApp.TOOL_ERASER) {
            this.eraseStrokesUnderCurrentPath();
        } else {
            if (this.currentPath.points.length > 1 || (this.currentPath.points.length === 1 && this.currentTool !== AnnotationApp.TOOL_HIGHLIGHTER)) {
                 this.drawings.push(this.currentPath);
            } else if (this.currentTool === AnnotationApp.TOOL_HIGHLIGHTER && this.currentPath.points.length === 2 &&
                       this.currentPath.points[0].x === this.currentPath.points[1].x &&
                       this.currentPath.points[0].y === this.currentPath.points[1].y) {
                // عدم ذخیره هایلایتر تک کلیکی
            } else if (this.currentTool === AnnotationApp.TOOL_HIGHLIGHTER && this.currentPath.points.length > 0) {
                 this.drawings.push(this.currentPath);
            }
        }
        this.redrawCommittedDrawings();
        this.saveDrawings();
    }

    _finalizeHighlighterPath() {
        if (!this.currentPath || this.currentPath.tool !== AnnotationApp.TOOL_HIGHLIGHTER || this.currentPath.points.length === 0) return;
        const startPoint = this.currentPath.points[0];
        const endPoint = this.currentPath.points.length > 1 ? this.currentPath.points[this.currentPath.points.length - 1] : startPoint;
        this.currentPath.points = [startPoint, endPoint];
    }

    // متد جدید برای محاسبه فاصله نقطه تا پاره‌خط (به توان دو)
    _distToSegmentSquared(p, v, w) {
        const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
        if (l2 === 0) return Math.pow(p.x - v.x, 2) + Math.pow(p.y - v.y, 2);
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        const projectionX = v.x + t * (w.x - v.x);
        const projectionY = v.y + t * (w.y - v.y);
        return Math.pow(p.x - projectionX, 2) + Math.pow(p.y - projectionY, 2);
    }

    eraseStrokesUnderCurrentPath() {
        if (!this.currentPath || this.currentPath.points.length === 0 || this.currentPath.tool !== AnnotationApp.TOOL_ERASER) return;

        const eraserPathPoints = this.currentPath.points;
        const drawingsToDelete = new Set();

        for (const drawing of this.drawings) {
            if (drawing.tool === AnnotationApp.TOOL_ERASER || drawingsToDelete.has(drawing)) continue;

            const drawnPathPoints = drawing.points;
            if (drawnPathPoints.length < 1) continue;

            for (const eraserPt of eraserPathPoints) {
                // آستانه برخورد: شعاع پاک‌کن + نصف ضخامت خط هدف
                // به توان دو برای مقایسه با فاصله به توان دو
                const collisionThresholdSquared = Math.pow((this.eraserWidth / 2) + (drawing.lineWidth / 2), 2);

                if (drawnPathPoints.length === 1) { // اگر طراحی یک نقطه است
                    const distSq = Math.pow(drawnPathPoints[0].x - eraserPt.x, 2) + Math.pow(drawnPathPoints[0].y - eraserPt.y, 2);
                    if (distSq < collisionThresholdSquared) {
                        drawingsToDelete.add(drawing);
                        break;
                    }
                } else { // اگر طراحی یک مسیر با پاره‌خط‌ها است
                    for (let i = 0; i < drawnPathPoints.length - 1; i++) {
                        const p1 = drawnPathPoints[i];
                        const p2 = drawnPathPoints[i + 1];
                        const distSq = this._distToSegmentSquared(eraserPt, p1, p2);

                        if (distSq < collisionThresholdSquared) {
                            drawingsToDelete.add(drawing);
                            break; // این طراحی برای حذف علامت‌گذاری شد، بررسی نقاط دیگر آن لازم نیست
                        }
                    }
                }
                if (drawingsToDelete.has(drawing)) break; // به طراحی بعدی برو اگر فعلی علامت‌گذاری شده
            }
        }

        if (drawingsToDelete.size > 0) {
            this.drawings = this.drawings.filter(drawing => !drawingsToDelete.has(drawing));
            console.log(`AnnotationApp: ${drawingsToDelete.size} یادداشت پاک شد.`);
        }
    }

    redrawCommittedDrawings() {
        this.committedCtx.clearRect(0, 0, this.committedCanvas.width, this.committedCanvas.height);
        this.drawings.forEach(path => this._drawSinglePathOnContext(path, this.committedCtx, false));
    }

    renderVisibleCanvasRegion() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (this.committedCanvas.width > 0 && this.committedCanvas.height > 0) {
            this.ctx.drawImage(this.committedCanvas,
                this.scrollOffsetX, this.scrollOffsetY, this.viewportWidth, this.viewportHeight,
                0, 0, this.viewportWidth, this.viewportHeight);
        }
        if (this.currentPath && (this.isDrawing || this.interactionState === AnnotationApp.INTERACTION_STATE_DRAWING)) {
            this._drawSinglePathOnContext(this.currentPath, this.ctx, true);
        }
    }

    _drawSinglePathOnContext(path, context, isLivePathOnViewport = false) {
        if (!path || path.points.length === 0) return;
        const originalGCO = context.globalCompositeOperation; const originalGA = context.globalAlpha;
        this._setupDrawingContextStyle(path, context);
        if (path.tool === AnnotationApp.TOOL_ERASER && !( (this.isDrawing || this.interactionState === AnnotationApp.INTERACTION_STATE_DRAWING) && path === this.currentPath)) {
            context.globalCompositeOperation = originalGCO; context.globalAlpha = originalGA; return;
        }
        this._drawPathPointsOnContext(path, context, isLivePathOnViewport);
        context.globalCompositeOperation = originalGCO; context.globalAlpha = originalGA;
    }

    _setupDrawingContextStyle(path, context) {
        context.beginPath(); context.lineCap = "round"; context.lineJoin = "round";
        let gco = 'source-over'; let alpha = path.opacity !== undefined ? path.opacity : 1.0;
        let strokeStyle = path.color || '#000000'; let lineWidth = path.lineWidth || 1;

        if (path.tool === AnnotationApp.TOOL_ERASER && (this.isDrawing || this.interactionState === AnnotationApp.INTERACTION_STATE_DRAWING) && path === this.currentPath) {
            strokeStyle = "rgba(200, 0, 0, 0.6)"; lineWidth = path.lineWidth; alpha = 0.6;
        } else if (path.tool === AnnotationApp.TOOL_HIGHLIGHTER) {
            gco = 'darken';
        }
        context.strokeStyle = strokeStyle; context.lineWidth = lineWidth;
        context.globalAlpha = alpha; context.globalCompositeOperation = gco;
    }

    _drawPathPointsOnContext(path, context, isLivePathOnViewport) {
        if (path.points.length === 0) return;
        const firstPoint = this._transformPointIfRequired(path.points[0], isLivePathOnViewport);
        context.moveTo(firstPoint.x, firstPoint.y);
        for (let i = 1; i < path.points.length; i++) {
            const point = this._transformPointIfRequired(path.points[i], isLivePathOnViewport);
            context.lineTo(point.x, point.y);
        }
        context.stroke();
    }

    _transformPointIfRequired(point, shouldTransform) {
        if (shouldTransform) return { x: point.x - this.scrollOffsetX, y: point.y - this.scrollOffsetY };
        return point;
    }

    selectTool(toolName) {
        this.currentTool = toolName;
        this.updateActiveToolButtonVisuals();
        this.updateToolSettingsVisibility();
        console.log(`AnnotationApp: ابزار "${toolName}" انتخاب شد.`);
    }

    updateActiveToolButtonVisuals() {
        const buttons = {
            [AnnotationApp.TOOL_PEN]: this.penBtn,
            [AnnotationApp.TOOL_HIGHLIGHTER]: this.highlighterBtn,
            [AnnotationApp.TOOL_ERASER]: this.eraserBtn
        };
        for (const tool in buttons) {
            if (buttons[tool]) buttons[tool].classList.toggle("active", this.currentTool === tool);
        }
    }

    clearAllAnnotations() {
        const confirmed = window.confirm("آیا مطمئن هستید که می‌خواهید تمام یادداشت‌ها و هایلایت‌ها را پاک کنید؟ این عمل قابل بازگشت نیست.");
        if (confirmed) {
            this.drawings = []; localStorage.removeItem(this.storageKey);
            this.redrawCommittedDrawings(); this.renderVisibleCanvasRegion();
            console.log("AnnotationApp: تمام یادداشت‌ها پاک شدند.");
        } else {
            console.log("AnnotationApp: عملیات پاک کردن یادداشت‌ها لغو شد.");
        }
    }

    saveDrawings() {
        try {
            const drawingsToSave = this.drawings.filter(path => path.tool !== AnnotationApp.TOOL_ERASER);
            localStorage.setItem(this.storageKey, JSON.stringify(drawingsToSave));
        } catch (error) {
            console.error("AnnotationApp: خطا در ذخیره‌سازی یادداشت‌ها:", error);
            console.warn("ممکن است حافظه مرورگر پر باشد.");
        }
    }

    loadDrawings() {
        const savedData = localStorage.getItem(this.storageKey);
        if (savedData) {
            try {
                this.drawings = JSON.parse(savedData);
                this._normalizeLoadedDrawingsProperties();
                console.log(`AnnotationApp: ${this.drawings.length} یادداشت بارگذاری شد.`);
            } catch (error) {
                console.error("AnnotationApp: خطا در پارس کردن یادداشت‌های ذخیره شده:", error);
                this.drawings = []; localStorage.removeItem(this.storageKey);
            }
        } else {
            this.drawings = []; console.log("AnnotationApp: یادداشت ذخیره‌ شده‌ای یافت نشد.");
        }
        this.redrawCommittedDrawings(); this.renderVisibleCanvasRegion();
    }

    _normalizeLoadedDrawingsProperties() {
        this.drawings.forEach(path => {
            if (path.opacity === undefined) path.opacity = path.tool === AnnotationApp.TOOL_HIGHLIGHTER ? this.HIGHLIGHTER_OPACITY : 1.0;
            if (path.lineWidth === undefined) {
                switch (path.tool) {
                    case AnnotationApp.TOOL_PEN: path.lineWidth = this.penLineWidth; break;
                    case AnnotationApp.TOOL_HIGHLIGHTER: path.lineWidth = this.highlighterLineWidth; break;
                    default: path.lineWidth = 1; break;
                }
            }
        });
    }

    destroy() {
        console.log("AnnotationApp: در حال تخریب نمونه...");
        window.removeEventListener("resize", this._boundUpdateVirtualCanvas);
        window.removeEventListener("scroll", this._boundUpdateVirtualCanvas);
        this._cancelRenderFrame();
        if (this.virtualCanvasContainer) { this.virtualCanvasContainer.remove(); this.virtualCanvasContainer = null; }
        if (this.toolsPanel && this.toolsPanel.parentElement) { this.toolsPanel.remove(); this.toolsPanel = null; }
        if (this.masterAnnotationToggleBtn && this.masterAnnotationToggleBtn.parentElement) { this.masterAnnotationToggleBtn.remove(); this.masterAnnotationToggleBtn = null; }
        this.targetContainer = null; this.canvas = null; this.ctx = null;
        this.committedCanvas = null; this.committedCtx = null; this.drawings = [];
        console.log("AnnotationApp: نمونه با موفقیت تخریب شد.");
    }
}

// --- کد مربوط به استایل‌ها و فونت‌ها و نوار پیشرفت اسکرول بدون تغییر باقی می‌ماند ---
const localCSS = document.createElement("link");
localCSS.rel = "stylesheet";
localCSS.href = "./note.css";
document.head.appendChild(localCSS);

const googleFont = document.createElement("link");
googleFont.rel = "stylesheet";
googleFont.href = "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200";
document.head.appendChild(googleFont);
