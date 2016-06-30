// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  Message
} from 'phosphor-messaging';

import {
  ISignal, Signal, clearSignalData
} from 'phosphor-signaling';

import {
  Widget
} from 'phosphor-widget';

import {
  ICompletionModel, ICompletionItem
} from './model';

/**
 * The class name added to completion menu widgets.
 */
const COMPLETION_CLASS = 'jp-Completion';

/**
 * The class name added to completion menu items.
 */
const ITEM_CLASS = 'jp-Completion-item';

/**
 * The class name added to an active completion menu item.
 */
const ACTIVE_CLASS = 'jp-mod-active';

/**
 * The maximum height of a completion widget.
 */
const MAX_HEIGHT = 250;

/**
 * A flag to indicate that event handlers are caught in the capture phase.
 */
const USE_CAPTURE = true;


/**
 * A widget that enables text completion.
 */
export
class CompletionWidget extends Widget {
  /**
   * Create the DOM node for a text completion menu.
   */
  static createNode(): HTMLElement {
    let node = document.createElement('ul');
    return node;
  }

  /**
   * Construct a text completion menu widget.
   */
  constructor(options: CompletionWidget.IOptions = {}) {
    super();
    this._renderer = options.renderer || CompletionWidget.defaultRenderer;
    this._reference = options.reference || null;
    this.model = options.model || null;
    this.addClass(COMPLETION_CLASS);
  }


  /**
   * A signal emitted when a selection is made from the completion menu.
   */
  get selected(): ISignal<CompletionWidget, string> {
    return Private.selectedSignal.bind(this);
  }

  /**
   * The model used by the completion widget.
   *
   * #### Notes
   * This is a read-only property.
   */
  get model(): ICompletionModel {
    return this._model;
  }
  set model(model: ICompletionModel) {
    if (!model && !this._model || model === this._model) {
      return;
    }
    if (this._model) {
      this._model.stateChanged.disconnect(this.onModelStateChanged, this);
    }
    this._model = model;
    if (this._model) {
      this._model.stateChanged.connect(this.onModelStateChanged, this);
    }
  }

  /**
   * The semantic parent of the completion widget, its reference widget.
   */
  get reference(): Widget {
    return this._reference;
  }
  set reference(widget: Widget) {
    this._reference = widget;
  }

  /**
   * Dispose of the resources held by the completion widget.
   */
  dispose() {
    if (this.isDisposed) {
      return;
    }
    this._model = null;
    super.dispose();
  }

  /**
   * Handle the DOM events for the widget.
   *
   * @param event - The DOM event sent to the widget.
   *
   * #### Notes
   * This method implements the DOM `EventListener` interface and is
   * called in response to events on the dock panel's node. It should
   * not be called directly by user code.
   */
  handleEvent(event: Event): void {
    if (this.isHidden || !this._reference) {
      return;
    }
    switch (event.type) {
    case 'keydown':
      this._evtKeydown(event as KeyboardEvent);
      break;
    case 'mousedown':
      this._evtMousedown(event as MouseEvent);
      break;
    case 'scroll':
      this._evtScroll(event as MouseEvent);
      break;
    default:
      break;
    }
  }

  /**
   * Handle `after_attach` messages for the widget.
   *
   * #### Notes
   * Captures window events in capture phase to dismiss or navigate the
   * completion widget.
   *
   * Because its parent (reference) widgets use window listeners instead of
   * document listeners, the completion widget must also use window listeners
   * in the capture phase.
   */
  protected onAfterAttach(msg: Message): void {
    window.addEventListener('keydown', this, USE_CAPTURE);
    window.addEventListener('mousedown', this, USE_CAPTURE);
    window.addEventListener('scroll', this, USE_CAPTURE);
  }

  /**
   * Handle `before_detach` messages for the widget.
   */
  protected onBeforeDetach(msg: Message): void {
    window.removeEventListener('keydown', this, USE_CAPTURE);
    window.removeEventListener('mousedown', this, USE_CAPTURE);
    window.removeEventListener('scroll', this, USE_CAPTURE);
  }

  /**
   * Handle `update_request` messages.
   */
  protected onUpdateRequest(msg: Message): void {
    let model = this.model;
    if (!model) {
      return;
    }

    let items = model.items;

    // If there are no items, hide and bail.
    if (!items || !items.length) {
      this.hide();
      return;
    }

    // If there is only one item, signal and bail.
    if (items.length === 1) {
      this.selected.emit(items[0].raw);
      this._reset();
      return;
    }

    let node = this.node;
    node.textContent = '';

    for (let item of items) {
      let li = this._renderer.createItemNode(item);
      // Set the raw, un-marked up value as a data attribute.
      li.dataset['value'] = item.raw;
      node.appendChild(li);
    }

    let active = node.querySelectorAll(`.${ITEM_CLASS}`)[this._activeIndex];
    active.classList.add(ACTIVE_CLASS);

    if (this.isHidden) {
      this.show();
    }

    let coords = this._model.current ? this._model.current.coords
      : this._model.original.coords;
    let availableHeight = coords.top;
    let maxHeight = Math.min(availableHeight, MAX_HEIGHT);
    node.style.maxHeight = `${maxHeight}px`;

    // Account for 1px border width.
    let left = Math.floor(coords.left) + 1;
    let rect = node.getBoundingClientRect();
    let top = availableHeight - rect.height;
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
    node.style.width = 'auto';
    // Expand the menu width by the scrollbar size, if present.
    if (node.scrollHeight > maxHeight) {
      node.style.width = `${2 * node.offsetWidth - node.clientWidth}px`;
      node.scrollTop = 0;
    }
  }

  /**
   * Handle model state changes.
   */
  protected onModelStateChanged(): void {
    if (this.isAttached) {
      this.update();
    }
  }

  /**
   * Handle mousedown events for the widget.
   */
  private _evtMousedown(event: MouseEvent) {
    if (Private.nonstandardClick(event)) {
      this._reset();
      return;
    }

    let target = event.target as HTMLElement;
    while (target !== document.documentElement) {
      // If the user has made a selection, emit its value and reset the widget.
      if (target.classList.contains(ITEM_CLASS)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        this.selected.emit(target.dataset['value']);
        this._reset();
        return;
      }
      // If the mouse event happened anywhere else in the widget, bail.
      if (target === this.node) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
      target = target.parentElement;
    }
    this._reset();
  }

  /**
   * Handle keydown events for the widget.
   */
  private _evtKeydown(event: KeyboardEvent) {
    let target = event.target as HTMLElement;
    while (target !== document.documentElement) {
      if (target === this._reference.node) {
        switch (event.keyCode) {
        case 9:  // Tab key
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          if (this._populateSubset()) {
            return;
          }
          this._selectActive();
          return;
        case 13: // Enter key
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          this._selectActive();
          return;
        case 27: // Escape key
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          this._reset();
          return;
        case 38: // Up arrow key
        case 40: // Down arrow key
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          this._cycle(event.keyCode === 38 ? 'up' : 'down');
          return;
        default:
          return;
        }
      }
      target = target.parentElement;
    }
    this._reset();
  }

  /**
   * Handle scroll events for the widget
   */
  private _evtScroll(event: MouseEvent) {
    let target = event.target as HTMLElement;
    while (target !== document.documentElement) {
      // If the scroll event happened in the completion widget, allow it.
      if (target === this.node) {
        return;
      }
      if (window.getComputedStyle(target).overflow === 'hidden') {
        return;
      }
      target = target.parentElement;
    }
    this._reset();
  }

  /**
   * Cycle through the available completion items.
   */
  private _cycle(direction: 'up' | 'down'): void {
    let items = this.node.querySelectorAll(`.${ITEM_CLASS}`);
    let index = this._activeIndex;
    let active = this.node.querySelector(`.${ACTIVE_CLASS}`) as HTMLElement;
    active.classList.remove(ACTIVE_CLASS);
    if (direction === 'up') {
      this._activeIndex = index === 0 ? items.length - 1 : index - 1;
    } else {
      this._activeIndex = index < items.length - 1 ? index + 1 : 0;
    }
    active = items[this._activeIndex] as HTMLElement;
    active.classList.add(ACTIVE_CLASS);
    Private.scrollIfNeeded(this.node, active);
  }

  /**
   * Populate the completion up to the longest initial subset of items.
   *
   * @returns `true` if a subset match was found and populated.
   */
  private _populateSubset(): boolean {
    let items = this.node.querySelectorAll(`.${ITEM_CLASS}`);
    let subset = Private.commonSubset(Private.itemValues(items));
    let query = this.model.query;
    if (subset && subset !== query && subset.indexOf(query) === 0) {
      this.model.query = subset;
      this.selected.emit(subset);
      this.update();
      return true;
    }
    return false;
  }

  /**
   * Reset the widget.
   */
  private _reset(): void {
    if (this._model) {
      this._model.reset();
    }
    this._activeIndex = 0;
  }

  /**
   * Emit the selected signal for the current active item and reset.
   */
  private _selectActive(): void {
    let active = this.node.querySelector(`.${ACTIVE_CLASS}`) as HTMLElement;
    this.selected.emit(active.dataset['value']);
    this._reset();
  }

  private _activeIndex = 0;
  private _model: ICompletionModel = null;
  private _reference: Widget = null;
  private _renderer: CompletionWidget.IRenderer = null;
}


export
namespace CompletionWidget {
  /**
   * The initialization options for a completion widget.
   */
  export
  interface IOptions {
    /**
     * The model for the completion widget.
     */
    model?: ICompletionModel;

    /**
     * The semantic parent of the completion widget, its reference widget.
     */
    reference?: Widget;

    /**
     * The renderer for the completion widget nodes.
     */
    renderer?: IRenderer;
  }

  /**
   * A renderer for completion widget nodes.
   */
  export
  interface IRenderer {
    /**
     * Create an item node (an `li` element) for a text completion menu.
     */
    createItemNode(item: ICompletionItem): HTMLLIElement;
  }

  /**
   * The default implementation of an `IRenderer`.
   */
  export
  class Renderer implements IRenderer {
    /**
     * Create an item node for a text completion menu.
     */
    createItemNode(item: ICompletionItem): HTMLLIElement {
      let li = document.createElement('li');
      let code = document.createElement('code');

      // Use innerHTML because search results include <mark> tags.
      code.innerHTML = item.text;

      li.className = ITEM_CLASS;
      li.appendChild(code);
      return li;
    }
  }


  /**
   * The default `IRenderer` instance.
   */
  export
  const defaultRenderer = new Renderer();
}


/**
 * A namespace for completion widget private data.
 */
namespace Private {
  /**
   * A signal emitted when state of the completion menu changes.
   */
  export
  const selectedSignal = new Signal<CompletionWidget, string>();

  /**
   * Returns the common subset string that a list of strings shares.
   */
  export
  function commonSubset(values: string[]): string {
    let len = values.length;
    let subset = '';
    if (len < 2) {
      return subset;
    }
    let strlen = values[0].length;
    for (let i = 0; i < strlen; i++) {
      let ch = values[0][i];
      for (let j = 1; j < len; j++) {
        if (values[j][i] !== ch) {
          return subset;
        }
      }
      subset += ch;
    }
    return subset;
  }

  /**
   * Returns the list of raw item values currently in the DOM.
   */
  export
  function itemValues(items: NodeList): string[] {
    let values: string[] = [];
    for (let i = 0, len = items.length; i < len; i++) {
      values.push((items[i] as HTMLElement).dataset['value']);
    }
    return values;
  }

  /**
   * Returns true for any modified click event (i.e., not a left-click).
   */
  export
  function nonstandardClick(event: MouseEvent): boolean {
    return event.button !== 0 ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.metaKey;
  }

  /**
   * Scroll an element into view if needed.
   *
   * @param area - The scroll area element.
   *
   * @param elem - The element of interest.
   */
  export
  function scrollIfNeeded(area: HTMLElement, elem: HTMLElement): void {
    let ar = area.getBoundingClientRect();
    let er = elem.getBoundingClientRect();
    if (er.top < ar.top - 10) {
      area.scrollTop -= ar.top - er.top + 10;
    } else if (er.bottom > ar.bottom + 10) {
      area.scrollTop += er.bottom - ar.bottom + 10;
    }
  }
}
