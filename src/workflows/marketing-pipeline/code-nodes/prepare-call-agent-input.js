const fields = $('Extract Task Fields').first().json;
return [{
  json: {
    agent_id: fields.agent_id,
    task_title: fields.task_title,
    task_description: fields.task_description,
    criterios_de_aceite: fields.criterios_de_aceite,
    task_id: fields.task_id,
  },
}];
