const item = $input.first().json;
return [{
  json: {
    ...item,
    ingress_mode: "first_draft",
  },
}];
