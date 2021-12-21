import { BDom, mount } from "../blockdom";
import type { ComponentNode } from "./component_node";
import { fibersInError, handleError } from "./error_handling";
import { STATUS } from "./status";

/**
 * Cleans on the root fiber the patch and willPatch fiber lists
 * It is typically needed when the same root fiber needs to recycle on
 * of its children or grandchildren's fiber.
 */
function cleanPatchableFiber(child: Fiber, root: RootFiber) {
  const { willPatch, patched } = root;
  let i = willPatch.indexOf(child);
  if (i > -1) {
    willPatch.splice(i, 1);
  }
  i = patched.indexOf(child);
  if (i > -1) {
    patched.splice(i, 1);
  }
}

export function makeChildFiber(node: ComponentNode, parent: Fiber): Fiber {
  let current = node.fiber;
  if (current) {
    // current is necessarily a rootfiber here
    let root = parent.root;
    const isSameRoot = current.root === root;
    cancelFibers(root, current.children);
    current.children = [];
    current.parent = parent;
    // only increment our rendering if we were not
    // already accounted for, or that we have been rendered
    // already (in which case our fiber was removed from the root rendering)
    if (!isSameRoot || current.bdom) {
      root.counter++;
    }

    if (isSameRoot) {
      cleanPatchableFiber(current, root);
    }

    current.bdom = null;
    current.root = root;
    return current;
  }
  return new Fiber(node, parent);
}

export function makeRootFiber(node: ComponentNode): Fiber {
  let current = node.fiber;
  if (current) {
    let root = current.root;
    root.counter -= cancelFibers(root, current.children);
    current.children = [];
    root.counter++;
    current.bdom = null;
    if (fibersInError.has(current)) {
      fibersInError.delete(current);
      fibersInError.delete(root);
      current.appliedToDom = false;
    }
    return current;
  }
  const fiber = new RootFiber(node, null);
  if (node.willPatch.length) {
    fiber.willPatch.push(fiber);
  }
  if (node.patched.length) {
    fiber.patched.push(fiber);
  }

  return fiber;
}

/**
 * @returns number of not-yet rendered fibers cancelled
 */
function cancelFibers(root: any, fibers: Fiber[]): number {
  let result = 0;
  for (let fiber of fibers) {
    fiber.node.fiber = null;
    fiber.root = root;
    if (!fiber.bdom) {
      result++;
    }
    result += cancelFibers(root, fiber.children);
  }
  return result;
}

export class Fiber {
  node: ComponentNode;
  bdom: BDom | null = null;
  root: RootFiber;
  parent: Fiber | null;
  children: Fiber[] = [];
  appliedToDom = false;

  constructor(node: ComponentNode, parent: Fiber | null) {
    this.node = node;
    this.parent = parent;
    if (parent) {
      const root = parent.root;
      root.counter++;
      this.root = root;
      parent.children.push(this);
    } else {
      this.root = this as any;
    }
  }
}

export class RootFiber extends Fiber {
  counter: number = 1;

  // only add stuff in this if they have registered some hooks
  willPatch: Fiber[] = [];
  patched: Fiber[] = [];
  mounted: Fiber[] = [];
  // A fiber is typically locked when it is completing and the patch has not, or is being applied.
  // i.e.: render triggered in onWillUnmount or in willPatch will be delayed
  locked: boolean = false;

  complete() {
    const node = this.node;
    this.locked = true;
    let current: Fiber | undefined = undefined;
    try {
      // Step 1: calling all willPatch lifecycle hooks
      for (current of this.willPatch) {
        // because of the asynchronous nature of the rendering, some parts of the
        // UI may have been rendered, then deleted in a followup rendering, and we
        // do not want to call onWillPatch in that case.
        let node = current.node;
        if (node.fiber === current) {
          const component = node.component;
          for (let cb of node.willPatch) {
            cb.call(component);
          }
        }
      }
      current = undefined;

      // Step 2: patching the dom
      node.bdom!.patch(this.bdom!, Object.keys(node.children).length > 0);
      this.appliedToDom = true;

      this.locked = false;
      // unregistering the fiber before mounted since it can do another render
      // and that the current rendering is obviously completed
      node.fiber = null;

      // Step 4: calling all mounted lifecycle hooks
      let mountedFibers = this.mounted;
      while ((current = mountedFibers.pop())) {
        current = current;
        if (current.appliedToDom) {
          for (let cb of current.node.mounted) {
            cb();
          }
        }
      }

      // Step 5: calling all patched hooks
      let patchedFibers = this.patched;
      while ((current = patchedFibers.pop())) {
        current = current;
        if (current.appliedToDom) {
          for (let cb of current.node.patched) {
            cb();
          }
        }
      }
    } catch (e) {
      this.locked = false;
      handleError({ fiber: current || this, error: e });
    }
  }
}

type Position = "first-child" | "last-child";

export interface MountOptions {
  position?: Position;
}

export class MountFiber extends RootFiber {
  target: HTMLElement;
  position: Position;

  constructor(node: ComponentNode, target: HTMLElement, options: MountOptions = {}) {
    super(node, null);
    this.target = target;
    this.position = options.position || "last-child";
  }
  complete() {
    let current: Fiber | undefined = this;
    try {
      const node = this.node;
      if (node.bdom) {
        // this is a complicated situation: if we mount a fiber with an existing
        // bdom, this means that this same fiber was already completed, mounted,
        // but a crash occurred in some mounted hook. Then, it was handled and
        // the new rendering is being applied.
        node.updateDom();
      } else {
        node.bdom = this.bdom;
        if (this.position === "last-child" || this.target.childNodes.length === 0) {
          mount(node.bdom!, this.target);
        } else {
          const firstChild = this.target.childNodes[0];
          mount(node.bdom!, this.target, firstChild);
        }
      }

      // unregistering the fiber before mounted since it can do another render
      // and that the current rendering is obviously completed
      node.fiber = null;

      node.status = STATUS.MOUNTED;
      this.appliedToDom = true;
      let mountedFibers = this.mounted;
      while ((current = mountedFibers.pop())) {
        if (current.appliedToDom) {
          for (let cb of current.node.mounted) {
            cb();
          }
        }
      }
    } catch (e) {
      handleError({ fiber: current as Fiber, error: e });
    }
  }
}