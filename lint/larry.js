// House rules, run by oxlint (see .oxlintrc.json).
//   larry/grid: spacing and sizing sit on a 4px grid, with 2px half steps.
//   larry/font-tokens: font families come from the tokens, never a string.
//   larry/ui-sdk: interactive controls come from UI SDK (@ui-sdk/react), never raw HTML.
//   larry/shared-pure: shared/ and server/ run in Node, so they never import the client (src/, React, StyleX, UI SDK).

const GRID = 2;
const SIZED = /^(margin|padding|gap|rowGap|columnGap|width|height|minWidth|minHeight|maxWidth|maxHeight|blockSize|inlineSize|top|right|bottom|left|inset|flexBasis|lineHeight)|Radius$/;

const keyName = (property) => property.key?.name ?? property.key?.value;

/** Calls `visit(cssProperty, valueNode)` for every value in a stylex.create or stylex.keyframes argument. */
function eachValue(node, visit) {
  const namespace = (object) => {
    for (const property of object.properties ?? []) {
      if (property.type !== "Property") continue;
      const key = String(keyName(property));
      // Old-style `":hover": { ... }` blocks hold properties, not values.
      if ((key.startsWith(":") || key.startsWith("@")) && property.value.type === "ObjectExpression") namespace(property.value);
      else value(key, property.value);
    }
  };
  const value = (key, v) => {
    if (v.type === "ObjectExpression") {
      for (const p of v.properties) if (p.type === "Property") value(key, p.value);
    } else if (v.type === "ConditionalExpression") {
      value(key, v.consequent);
      value(key, v.alternate);
    } else {
      visit(key, v);
    }
  };
  for (const entry of node.properties ?? []) {
    if (entry.type !== "Property") continue;
    const v = entry.value;
    if (v.type === "ObjectExpression") namespace(v);
    // Dynamic styles: (h) => ({ height: h })
    else if (v.type === "ArrowFunctionExpression" && v.body.type === "ObjectExpression") namespace(v.body);
  }
}

const isStylexCall = (node, names) =>
  node.callee.type === "MemberExpression" && node.callee.object.name === "stylex" && names.includes(node.callee.property.name);

const grid = {
  meta: { type: "suggestion", docs: { description: "Spacing and sizes are multiples of 2px (a 4px grid with half steps)." } },
  create(context) {
    const check = (key, node, px) => {
      if (px % GRID !== 0) context.report({ node, message: `${key}: ${px}px is off the grid. Use a multiple of ${GRID}px, preferably of 4px, or a token such as radii.pill.` });
    };
    return {
      CallExpression(node) {
        if (!isStylexCall(node, ["create", "keyframes"]) || !node.arguments[0]) return;
        eachValue(node.arguments[0], (key, v) => {
          if (!SIZED.test(key)) return;
          const literal = v.type === "UnaryExpression" && v.operator === "-" ? v.argument : v;
          if (literal.type !== "Literal") return;
          if (typeof literal.value === "number") {
            // A small unitless line height is a ratio, not pixels.
            if (key === "lineHeight" && literal.value < 4) return;
            check(key, v, Math.abs(literal.value));
          } else if (typeof literal.value === "string") {
            for (const [, n] of literal.value.matchAll(/(-?\d*\.?\d+)px/g)) check(key, v, Math.abs(Number(n)));
          }
        });
      },
    };
  },
};

const fontTokens = {
  meta: { type: "problem", docs: { description: "Font families come from fonts.sans or fonts.mono in tokens.stylex.ts." } },
  create(context) {
    return {
      CallExpression(node) {
        if (!isStylexCall(node, ["create"]) || !node.arguments[0]) return;
        eachValue(node.arguments[0], (key, v) => {
          if (key === "fontFamily" && (v.type === "Literal" || v.type === "TemplateLiteral"))
            context.report({ node: v, message: "Use fonts.sans (Open Runde) or fonts.mono (Paper Mono) from tokens.stylex.ts." });
        });
      },
    };
  },
};

/** Native controls and the UI SDK part to use instead. */
const CONTROLS = {
  button: "Button from @ui-sdk/react/button",
  input: "the matching UI SDK part, e.g. Input, Checkbox, Switch, Slider, FileInput or NumberInput",
  select: "Select from @ui-sdk/react/select",
  textarea: "Textarea from @ui-sdk/react/textarea",
  dialog: "Dialog or Drawer from @ui-sdk/react",
  details: "Collapsible or Accordion from @ui-sdk/react",
  progress: "Progress from @ui-sdk/react/progress",
  meter: "Meter from @ui-sdk/react/meter",
};
/** ARIA roles that mean someone hand-built a control UI SDK already has. */
const ROLES = new Set(["button", "switch", "checkbox", "radio", "slider", "tab", "tablist", "dialog", "menu", "menuitem", "listbox", "option", "combobox"]);

const uiSdk = {
  meta: { type: "problem", docs: { description: "Interactive controls come from UI SDK, the stack's control library, so behaviour and accessibility are not rebuilt by hand." } },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.type !== "JSXIdentifier") return;
        const tag = node.name.name;
        // Lowercase names are HTML elements; components like <Button> are fine.
        if (tag[0] !== tag[0].toLowerCase()) return;
        if (tag in CONTROLS) {
          context.report({ node, message: `<${tag}> is hand-rolled. Use ${CONTROLS[tag]}.` });
          return;
        }
        const role = node.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === "role");
        if (role?.value?.type === "Literal" && ROLES.has(role.value.value))
          context.report({ node, message: `role="${role.value.value}" on <${tag}> rebuilds a control. Use the UI SDK part for it.` });
      },
    };
  },
};

/** Imports that only work in the browser app. */
const CLIENT_ONLY = /^(react|react-dom|@react-three\/|@stylexjs\/|@ui-sdk\/|dialkit)|\/src\/|^\.\.?\/(\.\.\/)*src\/|\.stylex(\.ts)?$/;

const sharedPure = {
  meta: { type: "problem", docs: { description: "shared/ and server/ are imported by the Node server, so they must not depend on client code." } },
  create(context) {
    const check = (node, source) => {
      if (typeof source === "string" && CLIENT_ONLY.test(source))
        context.report({ node, message: `"${source}" is client code. shared/ and server/ run in Node; move what you need into shared/.` });
    };
    return {
      ImportDeclaration(node) {
        check(node, node.source.value);
      },
      ImportExpression(node) {
        check(node, node.source.value);
      },
    };
  },
};

export default { meta: { name: "larry" }, rules: { grid, "font-tokens": fontTokens, "ui-sdk": uiSdk, "shared-pure": sharedPure } };
