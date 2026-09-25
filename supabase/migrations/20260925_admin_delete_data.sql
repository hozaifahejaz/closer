-- Lets admins delete a couple's saved answers and favorites, or a single answer.

-- Same as before, plus each answer's user_id so a single answer can be deleted.
create or replace function public.admin_couple(p_token text, p_couple_id text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin(p_token);
  return json_build_object(
    'answers', coalesce((select json_agg(json_build_object('question', a.question, 'card_key', a.card_key, 'user_id', a.user_id, 'name', p.name,
                                                           'text', a.text, 'created_at', a.created_at) order by a.created_at desc, p.name)
                         from answers a join profiles p on p.id = a.user_id where a.couple_id = p_couple_id), '[]'),
    'favorites', coalesce((select json_agg(f.question order by f.created_at) from favorites f where f.couple_id = p_couple_id), '[]')
  );
end $$;

create or replace function public.admin_delete_couple_data(p_token text, p_couple_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_admin(p_token);
  delete from answers where couple_id = p_couple_id;
  delete from favorites where couple_id = p_couple_id;
end $$;

create or replace function public.admin_delete_answer(p_token text, p_couple_id text, p_card_key text, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_admin(p_token);
  delete from answers where couple_id = p_couple_id and card_key = p_card_key and user_id = p_user;
  if not found then raise exception 'That answer is already gone'; end if;
end $$;

revoke all on function public.admin_delete_couple_data(text, text), public.admin_delete_answer(text, text, text, uuid)
  from public, authenticated;
grant execute on function public.admin_delete_couple_data(text, text), public.admin_delete_answer(text, text, text, uuid) to anon;
