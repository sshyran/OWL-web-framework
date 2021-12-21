import { makeTestFixture, snapshotEverything, nextTick } from "../helpers";
import { mount, Component, useState, xml } from "../../src/index";

snapshotEverything();

let fixture: HTMLElement;

beforeEach(() => {
  fixture = makeTestFixture();
});

describe("event handling", () => {
  test("handler receive the event as argument", async () => {
    class Child extends Component {
      static template = xml`<div>simple vnode</div>`;
    }

    class Parent extends Component {
      static template = xml`<span t-on-click="inc"><Child/><t t-esc="state.value"/></span>`;
      static components = { Child };
      state = useState({ value: 1 });
      inc(ev: any) {
        this.state.value++;
        expect(ev.type).toBe("click");
      }
    }

    await mount(Parent, fixture);
    expect(fixture.innerHTML).toBe("<span><div>simple vnode</div>1</span>");

    fixture.querySelector("div")!.click();
    await nextTick();
    expect(fixture.innerHTML).toBe("<span><div>simple vnode</div>2</span>");
  });

  test("support for callable expression in event handler", async () => {
    class Counter extends Component {
      static template = xml`
      <div><t t-esc="state.value"/><input type="text" t-on-input="obj.onInput"/></div>`;
      state = useState({ value: "" });
      obj = { onInput: (ev: any) => (this.state.value = ev.target.value) };
    }

    await mount(Counter, fixture);
    await nextTick();
    expect(fixture.innerHTML).toBe(`<div><input type="text"></div>`);
    const input = fixture.getElementsByTagName("input")[0];
    input.value = "test";
    input.dispatchEvent(new Event("input"));
    await nextTick();
    expect(fixture.innerHTML).toBe(`<div>test<input type="text"></div>`);
  });

  test("t-on with handler bound to dynamic argument on a t-foreach", async () => {
    let onClickArgs: [number, MouseEvent] | null = null;
    class Parent extends Component {
      static template = xml`
        <div>
          <t t-foreach="items" t-as="item" t-key="item">
            <div class="item" t-on-click="ev => onClick(item, ev)"/>
          </t>
        </div>`;
      items = [1, 2, 3, 4];
      onClick(n: number, ev: MouseEvent) {
        onClickArgs = [n, ev];
      }
    }

    await mount(Parent, fixture);
    expect(onClickArgs).toBeNull();
    (<HTMLElement>fixture.querySelector(".item")).click();
    expect(onClickArgs![0]).toBe(1);
    expect(onClickArgs![1]).toBeInstanceOf(MouseEvent);
  });

  test("objects from scope are properly captured by t-on", async () => {
    let onClickArgs: [number, MouseEvent] | null = null;
    class Parent extends Component {
      static template = xml`
        <div>
          <t t-foreach="items" t-as="item" t-key="item">
            <div class="item" t-on-click="ev => onClick(item.val, ev)"/>
          </t>
        </div>`;
      items = [{ val: 1 }, { val: 2 }, { val: 3 }, { val: 4 }];
      onClick(n: number, ev: MouseEvent) {
        onClickArgs = [n, ev];
      }
    }
    await mount(Parent, fixture);
    expect(onClickArgs).toBeNull();
    (<HTMLElement>fixture.querySelector(".item")).click();
    expect(onClickArgs![0]).toBe(1);
    expect(onClickArgs![1]).toBeInstanceOf(MouseEvent);
  });
});