export interface SqlRequest {
  query: string;
  driver: string;
}

export interface CreateProperty {
  name: string;
  type: string;
  default?: string;
  constraint?: string;
}

export interface CreateDirectoryRequest {
  directory: string;
  properties?: CreateProperty[];
  driver: string;
}

export interface DeleteDirectoryRequest {
  directory: string;
  driver: string;
}

export interface ObjectsRequest {
  directory: string;
  cursor?: number;
  driver: string;
}

export interface ObjectsResponse {
  objects: Array<Record<string, unknown> | null>;
  propertyNames: string[];
  propertyTypes: string[];
  primaryKey: string | null;
  count: number;
}

export interface CreateObjectRequest {
  properties: Record<string, string>;
  directory: string;
  primaryKey?: string;
  driver: string;
}

export interface CreatePropertyRequest {
  directory: string;
  property: CreateProperty;
  driver: string;
}

export interface UpdateObjectRequest {
  id: number;
  directory: string;
  properties: Record<string, string>;
  driver: string;
}

export interface DeleteObjectRequest {
  ids: number[];
  directory: string;
  driver: string;
}
