import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  createActorSchema,
  createRelationshipSchema,
  createResourceSchema,
  createScenarioSchema,
  createWorldVariableSchema,
  errorResponseSchema,
  idParamSchema,
  resolveTurnSchema,
  successResponseSchema,
  updateActorSchema,
  updateRelationshipSchema,
  updateResourceSchema,
  updateScenarioSchema,
  updateWorldVariableSchema,
} from "./schemas";

const jsonResponseSchema = z.unknown();

const jsonContent = (schema: z.ZodType) => ({
  "application/json": {
    schema,
  },
});

const standardResponses = {
  400: {
    description: "Invalid request",
    content: jsonContent(errorResponseSchema),
  },
  500: {
    description: "Server error",
    content: jsonContent(errorResponseSchema),
  },
};

export function createOpenApiDocument() {
  const registry = new OpenAPIRegistry();

  registry.register("ErrorResponse", errorResponseSchema);
  registry.register("SuccessResponse", successResponseSchema);
  registry.register("CreateScenarioRequest", createScenarioSchema);
  registry.register("UpdateScenarioRequest", updateScenarioSchema);
  registry.register("CreateActorRequest", createActorSchema);
  registry.register("UpdateActorRequest", updateActorSchema);
  registry.register("CreateResourceRequest", createResourceSchema);
  registry.register("UpdateResourceRequest", updateResourceSchema);
  registry.register("CreateWorldVariableRequest", createWorldVariableSchema);
  registry.register("UpdateWorldVariableRequest", updateWorldVariableSchema);
  registry.register("CreateRelationshipRequest", createRelationshipSchema);
  registry.register("UpdateRelationshipRequest", updateRelationshipSchema);
  registry.register("ResolveTurnRequest", resolveTurnSchema);

  registry.registerPath({
    method: "get",
    path: "/api/health",
    summary: "Check API and database health",
    responses: {
      200: {
        description: "Healthy response",
        content: jsonContent(jsonResponseSchema),
      },
      503: {
        description: "Unhealthy response",
        content: jsonContent(errorResponseSchema),
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/scenarios",
    summary: "List scenarios",
    responses: {
      200: {
        description: "Scenario list",
        content: jsonContent(jsonResponseSchema),
      },
      ...standardResponses,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/scenarios",
    summary: "Create a scenario",
    request: {
      body: {
        required: true,
        content: jsonContent(createScenarioSchema),
      },
    },
    responses: {
      201: {
        description: "Created scenario",
        content: jsonContent(jsonResponseSchema),
      },
      ...standardResponses,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/scenarios/{id}",
    summary: "Get a scenario",
    request: { params: idParamSchema },
    responses: {
      200: {
        description: "Scenario details",
        content: jsonContent(jsonResponseSchema),
      },
      404: {
        description: "Scenario not found",
        content: jsonContent(errorResponseSchema),
      },
      ...standardResponses,
    },
  });

  registry.registerPath({
    method: "put",
    path: "/api/scenarios/{id}",
    summary: "Update a scenario",
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: jsonContent(updateScenarioSchema),
      },
    },
    responses: {
      200: {
        description: "Updated scenario",
        content: jsonContent(jsonResponseSchema),
      },
      ...standardResponses,
    },
  });

  registry.registerPath({
    method: "delete",
    path: "/api/scenarios/{id}",
    summary: "Delete a scenario",
    request: { params: idParamSchema },
    responses: {
      200: {
        description: "Deletion status",
        content: jsonContent(successResponseSchema),
      },
      ...standardResponses,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/scenarios/{id}/actors",
    summary: "Create an actor for a scenario",
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: jsonContent(createActorSchema),
      },
    },
    responses: {
      201: {
        description: "Created actor",
        content: jsonContent(jsonResponseSchema),
      },
      ...standardResponses,
    },
  });

  registry.registerPath({
    method: "put",
    path: "/api/actors/{id}",
    summary: "Update an actor",
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: jsonContent(updateActorSchema),
      },
    },
    responses: {
      200: {
        description: "Updated actor",
        content: jsonContent(jsonResponseSchema),
      },
      ...standardResponses,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/actors/{id}/resources",
    summary: "Create an actor resource",
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: jsonContent(createResourceSchema),
      },
    },
    responses: {
      201: {
        description: "Created resource",
        content: jsonContent(jsonResponseSchema),
      },
      ...standardResponses,
    },
  });

  registry.registerPath({
    method: "put",
    path: "/api/actors/{id}/resources",
    summary: "Update an actor resource",
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: jsonContent(updateResourceSchema),
      },
    },
    responses: {
      200: {
        description: "Updated resource",
        content: jsonContent(jsonResponseSchema),
      },
      ...standardResponses,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/scenarios/{id}/world-variables",
    summary: "Create a world variable",
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: jsonContent(createWorldVariableSchema),
      },
    },
    responses: {
      201: {
        description: "Created world variable",
        content: jsonContent(jsonResponseSchema),
      },
      ...standardResponses,
    },
  });

  registry.registerPath({
    method: "put",
    path: "/api/scenarios/{id}/world-variables",
    summary: "Update a world variable",
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: jsonContent(updateWorldVariableSchema),
      },
    },
    responses: {
      200: {
        description: "Updated world variable",
        content: jsonContent(jsonResponseSchema),
      },
      ...standardResponses,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/relationships",
    summary: "Create an actor relationship",
    request: {
      body: {
        required: true,
        content: jsonContent(createRelationshipSchema),
      },
    },
    responses: {
      201: {
        description: "Created relationship",
        content: jsonContent(jsonResponseSchema),
      },
      ...standardResponses,
    },
  });

  registry.registerPath({
    method: "put",
    path: "/api/relationships/{id}",
    summary: "Update an actor relationship",
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: jsonContent(updateRelationshipSchema),
      },
    },
    responses: {
      200: {
        description: "Updated relationship",
        content: jsonContent(jsonResponseSchema),
      },
      ...standardResponses,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/scenarios/{id}/sessions",
    summary: "Start a game session",
    request: { params: idParamSchema },
    responses: {
      201: {
        description: "Created game session",
        content: jsonContent(jsonResponseSchema),
      },
      ...standardResponses,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/sessions/{id}/turns",
    summary: "Resolve a turn or generate the initial turn page",
    request: {
      params: idParamSchema,
      body: {
        required: false,
        content: jsonContent(resolveTurnSchema),
      },
    },
    responses: {
      200: {
        description: "Resolved turn and page",
        content: jsonContent(jsonResponseSchema),
      },
      ...standardResponses,
    },
  });

  const generator = new OpenApiGeneratorV31(registry.definitions);

  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Choose Your Own Game Theory API",
      version: "0.1.0",
      description:
        "API for scenario authoring and turn-page based simulation play.",
    },
  });
}
