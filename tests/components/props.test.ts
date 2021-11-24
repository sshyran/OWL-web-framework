import { Component, mount, useState } from "../../src";
import { xml } from "../../src/tags";
import { makeTestFixture, snapshotEverything } from "../helpers";

let fixture: HTMLElement;

snapshotEverything();

beforeEach(() => {
  fixture = makeTestFixture();
});

describe("basics", () => {
  test("explicit object prop", async () => {
    class Child extends Component {
      static template = xml`<span><t t-esc="state.someval"/></span>`;
      state: any;
      setup() {
        this.state = useState({ someval: this.props.value });
      }
    }

    class Parent extends Component {
      static template = xml`<div><Child value="state.val"/></div>`;
      static components = { Child };
      state = useState({ val: 42 });
    }

    await mount(Parent, fixture);
    expect(fixture.innerHTML).toBe("<div><span>42</span></div>");
  });

  test("prop names can contain -", async () => {
    class Child extends Component {
      static template = xml`<div><t t-esc="props['prop-name']"/></div>`;
    }

    class Parent extends Component {
      static template = xml`<Child prop-name="7"/>`;
      static components = { Child };
    }

    await mount(Parent, fixture);
    expect(fixture.innerHTML).toBe("<div>7</div>");
  });

  test("accept ES6-like syntax for props (with getters)", async () => {
    class Child extends Component {
      static template = xml`<span><t t-esc="props.greetings"/></span>`;
    }

    class Parent extends Component {
      static template = xml`<div><Child greetings="greetings"/></div>`;
      static components = { Child };
      get greetings() {
        const name = "aaron";
        return `hello ${name}`;
      }
    }
    await mount(Parent, fixture);

    expect(fixture.innerHTML).toBe("<div><span>hello aaron</span></div>");
  });

  test("t-set works ", async () => {
    class Child extends Component {
      static template = xml`<span><t t-esc="props.val"/></span>`;
    }

    class Parent extends Component {
      static template = xml`
            <div>
                <t t-set="val" t-value="42"/>
                <Child val="val"/>
            </div>`;
      static components = { Child };
    }
    await mount(Parent, fixture);
    expect(fixture.innerHTML).toBe("<div><span>42</span></div>");
  });

  test("t-set with a body expression can be used as textual prop", async () => {
    class Child extends Component {
      static template = xml`<span t-esc="props.val"/>`;
    }
    class Parent extends Component {
      static components = { Child };
      static template = xml`
        <div>
          <t t-set="abc">42</t>
          <Child val="abc"/>
        </div>`;
    }

    await mount(Parent, fixture);
    expect(fixture.innerHTML).toBe("<div><span>42</span></div>");
  });

  test("t-set with a body expression can be passed in props, and then t-out", async () => {
    class Child extends Component {
      static template = xml`
        <span>
          <t t-esc="props.val"/>
          <t t-out="props.val"/>
        </span>`;
    }
    class Parent extends Component {
      static components = { Child };
      static template = xml`
        <div>
          <t t-set="abc"><p>43</p></t>
          <Child val="abc"/>
        </div>`;
    }

    await mount(Parent, fixture);
    expect(fixture.innerHTML).toBe("<div><span>&lt;p&gt;43&lt;/p&gt;<p>43</p></span></div>");
  });

  test("arrow functions as prop correctly capture their scope", async () => {
    class Child extends Component {
      static template = xml`<button t-on-click="props.onClick"/>`;
    }

    let onClickArgs: [number, MouseEvent] | null = null;
    class Parent extends Component {
      static template = xml`
        <t t-foreach="items" t-as="item" t-key="item.val">
          <Child onClick="ev => onClick(item.val, ev)"/>
        </t>
      `;
      static components = { Child };
      items = [{ val: 1 }, { val: 2 }, { val: 3 }, { val: 4 }];
      onClick(n: number, ev: MouseEvent) {
        onClickArgs = [n, ev];
      }
    }
    await mount(Parent, fixture);
    expect(onClickArgs).toBeNull();
    (<HTMLElement>fixture.querySelector("button")).click();
    expect(onClickArgs![0]).toBe(1);
    expect(onClickArgs![1]).toBeInstanceOf(MouseEvent);
  });

  test("support prop names that aren't valid bare object property names", async () => {
    expect.assertions(4);
    class Child extends Component {
      static template = xml`<button t-on-click="props.onClick"/>`;
      setup() {
        expect(this.props["some-dashed-prop"]).toBe(5);
        expect(this.props["a.b"]).toBe("keyword prop");
      }
    }

    class Parent extends Component {
      static template = xml`<Child some-dashed-prop="5" a.b="'keyword prop'"/>`;
      static components = { Child };
    }
    await mount(Parent, fixture);
  });
});
