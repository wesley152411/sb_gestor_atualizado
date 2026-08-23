--
-- PostgreSQL database dump
--

\restrict Fgu6TYYDkg7Lk9ocCpy5Xzrx3HQu7bVZGoSZX4NqbdRPelbqvZ10qTXpVY7Y1Pc

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11 (Debian 17.11-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id text NOT NULL,
    sender_id text,
    receiver_id text,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id text NOT NULL,
    name text NOT NULL,
    phone text,
    address text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    cpf text,
    decorator_id text,
    email text
);


--
-- Name: consumables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consumables (
    id text NOT NULL,
    decorator_id text,
    name text NOT NULL,
    category text NOT NULL,
    current_quantity integer NOT NULL,
    min_quantity integer NOT NULL,
    unit text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: decorators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.decorators (
    id text NOT NULL,
    name text NOT NULL,
    avatar_url text,
    membership_level text DEFAULT 'Membro'::text,
    location text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    instagram text,
    whatsapp text,
    phone text,
    about text,
    cover_url text,
    reach integer DEFAULT 0,
    contact_rate numeric DEFAULT 0.0,
    positive_reviews integer DEFAULT 0,
    logo_url text,
    is_internal boolean DEFAULT false NOT NULL
);


--
-- Name: forum_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_posts (
    id text NOT NULL,
    author_id text,
    title text NOT NULL,
    content text NOT NULL,
    category text DEFAULT 'Geral'::text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: inventory_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_items (
    id text NOT NULL,
    decorator_id text,
    name text NOT NULL,
    description text,
    image_url text,
    status text,
    stock_quantity integer DEFAULT 0,
    rental_price numeric(10,2) DEFAULT 0.00,
    internal_cost numeric(10,2) DEFAULT 0.00,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT inventory_items_status_check CHECK ((status = ANY (ARRAY['Público'::text, 'Privado'::text])))
);


--
-- Name: kits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kits (
    id text NOT NULL,
    decorator_id text,
    name text NOT NULL,
    description text,
    image_url text,
    value numeric(10,2) DEFAULT 0.00,
    items jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    status character varying(255) DEFAULT 'Privado'::character varying
);


--
-- Name: party_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.party_events (
    id text NOT NULL,
    client_name text NOT NULL,
    phone text,
    address text,
    setup_time text,
    start_time text,
    theme text,
    total_value numeric(10,2),
    event_date date,
    status text,
    items jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    decorator_id text,
    client_id text,
    public_token text,
    source_item_id text,
    source_kit_id text,
    observation text,
    submitted_at timestamp with time zone,
    CONSTRAINT party_events_status_check CHECK ((status = ANY (ARRAY['Aguardando preenchimento'::text, 'Aguardando confirmação'::text, 'Confirmado'::text, 'Finalizado'::text, 'Cancelado'::text])))
);


--
-- Name: rental_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rental_order_items (
    id text NOT NULL,
    order_id text NOT NULL,
    item_id text,
    kit_id text,
    name text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    price numeric(10,2)
);


--
-- Name: rental_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rental_orders (
    id text NOT NULL,
    renter_id text,
    owner_id text,
    total_value numeric(10,2) NOT NULL,
    status text DEFAULT 'Pendente'::text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    item_id text,
    event_date date,
    observation text
);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: consumables consumables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumables
    ADD CONSTRAINT consumables_pkey PRIMARY KEY (id);


--
-- Name: decorators decorators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decorators
    ADD CONSTRAINT decorators_pkey PRIMARY KEY (id);


--
-- Name: forum_posts forum_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_posts
    ADD CONSTRAINT forum_posts_pkey PRIMARY KEY (id);


--
-- Name: inventory_items inventory_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_pkey PRIMARY KEY (id);


--
-- Name: kits kits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kits
    ADD CONSTRAINT kits_pkey PRIMARY KEY (id);


--
-- Name: party_events party_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_events
    ADD CONSTRAINT party_events_pkey PRIMARY KEY (id);


--
-- Name: rental_order_items rental_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_order_items
    ADD CONSTRAINT rental_order_items_pkey PRIMARY KEY (id);


--
-- Name: rental_orders rental_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_orders
    ADD CONSTRAINT rental_orders_pkey PRIMARY KEY (id);


--
-- Name: idx_chats_receiver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chats_receiver ON public.chat_messages USING btree (receiver_id);


--
-- Name: idx_chats_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chats_sender ON public.chat_messages USING btree (sender_id);


--
-- Name: idx_clients_decorator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_decorator ON public.clients USING btree (decorator_id);


--
-- Name: idx_inv_decorator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_decorator ON public.inventory_items USING btree (decorator_id);


--
-- Name: idx_order_items_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_order ON public.rental_order_items USING btree (order_id);


--
-- Name: idx_orders_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_owner ON public.rental_orders USING btree (owner_id);


--
-- Name: idx_orders_renter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_renter ON public.rental_orders USING btree (renter_id);


--
-- Name: idx_party_events_decorator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_party_events_decorator ON public.party_events USING btree (decorator_id);


--
-- Name: idx_party_events_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_party_events_token ON public.party_events USING btree (public_token);


--
-- Name: party_events_public_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX party_events_public_token_key ON public.party_events USING btree (public_token);


--
-- Name: chat_messages chat_messages_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.decorators(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.decorators(id) ON DELETE CASCADE;


--
-- Name: clients clients_decorator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_decorator_id_fkey FOREIGN KEY (decorator_id) REFERENCES public.decorators(id) ON DELETE CASCADE;


--
-- Name: consumables consumables_decorator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumables
    ADD CONSTRAINT consumables_decorator_id_fkey FOREIGN KEY (decorator_id) REFERENCES public.decorators(id) ON DELETE CASCADE;


--
-- Name: forum_posts forum_posts_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_posts
    ADD CONSTRAINT forum_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.decorators(id) ON DELETE CASCADE;


--
-- Name: inventory_items inventory_items_decorator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_decorator_id_fkey FOREIGN KEY (decorator_id) REFERENCES public.decorators(id) ON DELETE CASCADE;


--
-- Name: kits kits_decorator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kits
    ADD CONSTRAINT kits_decorator_id_fkey FOREIGN KEY (decorator_id) REFERENCES public.decorators(id) ON DELETE CASCADE;


--
-- Name: party_events party_events_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_events
    ADD CONSTRAINT party_events_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: party_events party_events_decorator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_events
    ADD CONSTRAINT party_events_decorator_id_fkey FOREIGN KEY (decorator_id) REFERENCES public.decorators(id) ON DELETE CASCADE;


--
-- Name: party_events party_events_source_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_events
    ADD CONSTRAINT party_events_source_item_id_fkey FOREIGN KEY (source_item_id) REFERENCES public.inventory_items(id) ON DELETE SET NULL;


--
-- Name: party_events party_events_source_kit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_events
    ADD CONSTRAINT party_events_source_kit_id_fkey FOREIGN KEY (source_kit_id) REFERENCES public.kits(id) ON DELETE SET NULL;


--
-- Name: rental_order_items rental_order_items_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_order_items
    ADD CONSTRAINT rental_order_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.inventory_items(id) ON DELETE SET NULL;


--
-- Name: rental_order_items rental_order_items_kit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_order_items
    ADD CONSTRAINT rental_order_items_kit_id_fkey FOREIGN KEY (kit_id) REFERENCES public.kits(id) ON DELETE SET NULL;


--
-- Name: rental_order_items rental_order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_order_items
    ADD CONSTRAINT rental_order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.rental_orders(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: rental_orders rental_orders_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_orders
    ADD CONSTRAINT rental_orders_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.inventory_items(id);


--
-- Name: rental_orders rental_orders_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_orders
    ADD CONSTRAINT rental_orders_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.decorators(id) ON DELETE CASCADE;


--
-- Name: rental_orders rental_orders_renter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_orders
    ADD CONSTRAINT rental_orders_renter_id_fkey FOREIGN KEY (renter_id) REFERENCES public.decorators(id) ON DELETE CASCADE;


--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_messages chat_messages_party; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_messages_party ON public.chat_messages TO authenticated USING (((sender_id = (auth.uid())::text) OR (receiver_id = (auth.uid())::text))) WITH CHECK (((sender_id = (auth.uid())::text) OR (receiver_id = (auth.uid())::text)));


--
-- Name: clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

--
-- Name: clients clients_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_own ON public.clients TO authenticated USING ((decorator_id = (auth.uid())::text)) WITH CHECK ((decorator_id = (auth.uid())::text));


--
-- Name: consumables; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consumables ENABLE ROW LEVEL SECURITY;

--
-- Name: consumables consumables_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY consumables_own ON public.consumables TO authenticated USING ((decorator_id = (auth.uid())::text)) WITH CHECK ((decorator_id = (auth.uid())::text));


--
-- Name: decorators; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.decorators ENABLE ROW LEVEL SECURITY;

--
-- Name: decorators decorators_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY decorators_own ON public.decorators TO authenticated USING ((id = (auth.uid())::text)) WITH CHECK ((id = (auth.uid())::text));


--
-- Name: forum_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_posts forum_posts_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY forum_posts_own ON public.forum_posts TO authenticated USING ((author_id = (auth.uid())::text)) WITH CHECK ((author_id = (auth.uid())::text));


--
-- Name: inventory_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_items inventory_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_own ON public.inventory_items TO authenticated USING ((decorator_id = (auth.uid())::text)) WITH CHECK ((decorator_id = (auth.uid())::text));


--
-- Name: kits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kits ENABLE ROW LEVEL SECURITY;

--
-- Name: kits kits_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kits_own ON public.kits TO authenticated USING ((decorator_id = (auth.uid())::text)) WITH CHECK ((decorator_id = (auth.uid())::text));


--
-- Name: party_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.party_events ENABLE ROW LEVEL SECURITY;

--
-- Name: party_events party_events_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY party_events_own ON public.party_events TO authenticated USING ((decorator_id = (auth.uid())::text)) WITH CHECK ((decorator_id = (auth.uid())::text));


--
-- Name: rental_order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rental_order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: rental_order_items rental_order_items_party; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rental_order_items_party ON public.rental_order_items TO authenticated USING ((order_id IN ( SELECT rental_orders.id
   FROM public.rental_orders
  WHERE ((rental_orders.owner_id = (auth.uid())::text) OR (rental_orders.renter_id = (auth.uid())::text))))) WITH CHECK ((order_id IN ( SELECT rental_orders.id
   FROM public.rental_orders
  WHERE ((rental_orders.owner_id = (auth.uid())::text) OR (rental_orders.renter_id = (auth.uid())::text)))));


--
-- Name: rental_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rental_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: rental_orders rental_orders_party; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rental_orders_party ON public.rental_orders TO authenticated USING (((owner_id = (auth.uid())::text) OR (renter_id = (auth.uid())::text))) WITH CHECK (((owner_id = (auth.uid())::text) OR (renter_id = (auth.uid())::text)));


--
-- PostgreSQL database dump complete
--

\unrestrict Fgu6TYYDkg7Lk9ocCpy5Xzrx3HQu7bVZGoSZX4NqbdRPelbqvZ10qTXpVY7Y1Pc


-- ==================== Storage buckets (dados, não vêm no dump do schema) ====================
-- Replica os buckets existentes na produção. Idempotente.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('festora','festora', true, 5242880, ARRAY['image/webp','image/jpeg','image/png']::text[])
on conflict (id) do nothing;
