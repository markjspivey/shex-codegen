import { normalizeDuplicateProperties } from "../common";
import {
  generateShapeMethodsExport,
  generateShapeMethodsImport,
} from "./generates";
import { mapExpression } from "./mapExpressions";
import {
  NodeConstraintMembers,
  ShapeMembers,
  TripleConstraintMembers,
} from "../common/members";

const ShExUtil = require("@shexjs/core").Util;

const TypescriptVisitor = ShExUtil.Visitor();

TypescriptVisitor.generateImports = () => {
  return [generateShapeMethodsImport()];
};

TypescriptVisitor._visitValue = function (v: any[]) {
  return Array.isArray(v) ? v.join("\n") : v;
};

TypescriptVisitor.visitSchema = function (schema: any, fileName: string) {
  ShExUtil._expect(schema, "type", "Schema");
  const shapeDeclarations = this.visitShapes(
    schema["shapes"],
    schema._prefixes,
    fileName
  );
  return shapeDeclarations;
};

TypescriptVisitor.visitExpression = function (expr: any, context?: any) {
  if (typeof expr === "string") return this.visitInclusion(expr);
  const visited =
    expr.type === "TripleConstraint"
      ? this.visitTripleConstraint(expr, context)
      : expr.type === "OneOf"
      ? this.visitOneOf(expr, context)
      : expr.type === "EachOf"
      ? this.visitEachOf(expr, context)
      : null;
  if (visited === null) throw Error("unexpected expression type: " + expr.type);
  else return visited;
};

TypescriptVisitor.visitOneOf = function (expr: any, context?: any) {
  const visited: Record<string, any> = {
    expressions: expr.expressions.map((expression: any) =>
      mapExpression(this, expression, context)
    ),
  };

  visited.typed = !!visited.expressions.find((expr: any) => !!expr.typed);
  visited.childShapes = visited.expressions.reduce(
    (childShapes: string[], expr: any) =>
      Array.isArray(expr.childShapes)
        ? [...childShapes, ...expr.childShapes]
        : childShapes,
    []
  );

  return visited;
};

TypescriptVisitor.visitEachOf = function (expr: any, context?: any) {
  const visited: Record<string, any> = {
    expressions: expr.expressions.map((expression: any) =>
      mapExpression(this, expression, context)
    ),
  };

  visited.typed = !!visited.expressions.find((expr: any) => !!expr.typed);
  visited.childShapes = visited.expressions.reduce(
    (childShapes: string[], expr: any) =>
      Array.isArray(expr.childShapes)
        ? [...childShapes, ...expr.childShapes]
        : childShapes,
    []
  );

  return visited;
};

TypescriptVisitor.visitTripleConstraint = function (expr: any, context?: any) {
  const visited = {
    ...expr,
    expression: maybeGenerate(this, expr, TripleConstraintMembers, {
      ...context,
      predicate: expr.predicate,
    }),
  };
  const { valueExpr } = visited.expression;

  if (
    visited.predicate === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" &&
    valueExpr.values?.length !== 0
  ) {
    visited.typed = true;
  }

  if (typeof valueExpr === "string") {
    visited.childShapes = [valueExpr];
  }

  return visited;
};

TypescriptVisitor.visitNodeConstraint = function (expr: any, context: any) {
  ShExUtil._expect(expr, "type", "NodeConstraint");

  const visited: Record<string, any> = {
    expression: maybeGenerate(this, expr, NodeConstraintMembers, context),
  };

  return visited;
};

TypescriptVisitor.visitShape = function (shape: any, context: any) {
  ShExUtil._expect(shape, "type", "Shape");
  shape.expression.expressions = normalizeDuplicateProperties(
    shape.expression.expressions
  );

  const visited = maybeGenerate(this, shape, ShapeMembers, context);
  const { childShapes, typed } = visited.expression;

  return { ...visited, childShapes, typed };
};

TypescriptVisitor.visitShapes = function (
  shapes: any[],
  prefixes: any,
  fileName: string
) {
  const enumShape: string[] = [];
  if (shapes === undefined) return undefined;

  const visited = shapes
    .filter((shape) => {
      if (shape.values) {
        enumShape.push(shape.id);
        return false;
      } else {
        return true;
      }
    })
    .map((shape: any) => {
      const visitedShape = this.visitShapeDecl({
        ...shape,
        prefixes: prefixes,
      });

      visitedShape.childShapes = visitedShape.childShapes?.filter(
        (childShape: string) => !enumShape.includes(childShape)
      );

      return { id: shape.id, ...visitedShape };
    });

  const generatedShapes = visited.map((shape) =>
    generateShapeMethodsExport(shape, fileName)
  );

  return generatedShapes;
};

function maybeGenerate(
  Visitor: any,
  obj: any,
  members: string[],
  context?: any
) {
  const generated: Record<string, any> = {};
  members.forEach(function (member) {
    var methodName = "visit" + member.charAt(0).toUpperCase() + member.slice(1);
    if (member in obj) {
      var f = Visitor[methodName];
      if (typeof f !== "function") {
        throw Error(methodName + " not found in Visitor");
      }
      var t = f.call(
        Visitor,
        obj[member],
        context ?? {
          id: obj?.id,
          prefixes: obj?.prefixes,
          extra: obj?.extra,
        }
      );
      if (t !== undefined) {
        generated[member] = t;
      }
    }
  });
  return generated;
}

export default TypescriptVisitor;
