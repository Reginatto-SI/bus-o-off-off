
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public;

-- Normalize function
CREATE OR REPLACE FUNCTION public.normalize_city_name(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(trim(public.unaccent(input)))
$$;

-- Cities table
CREATE TABLE public.cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  state char(2) NOT NULL,
  normalized_name text NOT NULL GENERATED ALWAYS AS (public.normalize_city_name(name)) STORED,
  is_active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'seed',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique index to prevent duplicates
CREATE UNIQUE INDEX idx_cities_unique_normalized ON public.cities (normalized_name, state);

-- Trigram index for fast partial search
CREATE INDEX idx_cities_normalized_trgm ON public.cities USING GIN (normalized_name gin_trgm_ops);

-- Updated_at trigger
CREATE TRIGGER update_cities_updated_at
  BEFORE UPDATE ON public.cities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;

-- SELECT: anyone (including anon) can read active cities
CREATE POLICY "Anyone can view active cities"
  ON public.cities FOR SELECT
  USING (is_active = true);

-- INSERT: only admin users
CREATE POLICY "Admins can insert cities"
  ON public.cities FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

-- UPDATE: only developer
CREATE POLICY "Developer can update cities"
  ON public.cities FOR UPDATE
  TO authenticated
  USING (public.is_developer(auth.uid()))
  WITH CHECK (public.is_developer(auth.uid()));

-- DELETE: only developer
CREATE POLICY "Developer can delete cities"
  ON public.cities FOR DELETE
  TO authenticated
  USING (public.is_developer(auth.uid()));

-- SEED: Insert all cities from the static file
INSERT INTO public.cities (name, state, source) VALUES
('Rio Branco','AC','seed'),('Cruzeiro do Sul','AC','seed'),
('Maceió','AL','seed'),('Arapiraca','AL','seed'),
('Macapá','AP','seed'),('Santana','AP','seed'),
('Manaus','AM','seed'),('Parintins','AM','seed'),('Itacoatiara','AM','seed'),
('Salvador','BA','seed'),('Feira de Santana','BA','seed'),('Vitória da Conquista','BA','seed'),('Camaçari','BA','seed'),('Itabuna','BA','seed'),('Juazeiro','BA','seed'),('Ilhéus','BA','seed'),('Lauro de Freitas','BA','seed'),('Jequié','BA','seed'),('Teixeira de Freitas','BA','seed'),('Barreiras','BA','seed'),('Alagoinhas','BA','seed'),('Porto Seguro','BA','seed'),('Simões Filho','BA','seed'),('Paulo Afonso','BA','seed'),('Eunápolis','BA','seed'),('Santo Antônio de Jesus','BA','seed'),('Valença','BA','seed'),('Candeias','BA','seed'),('Guanambi','BA','seed'),
('Fortaleza','CE','seed'),('Caucaia','CE','seed'),('Juazeiro do Norte','CE','seed'),('Maracanaú','CE','seed'),('Sobral','CE','seed'),('Crato','CE','seed'),('Itapipoca','CE','seed'),('Maranguape','CE','seed'),('Iguatu','CE','seed'),('Quixadá','CE','seed'),
('Brasília','DF','seed'),
('Vitória','ES','seed'),('Vila Velha','ES','seed'),('Serra','ES','seed'),('Cariacica','ES','seed'),('Linhares','ES','seed'),('Cachoeiro de Itapemirim','ES','seed'),('Colatina','ES','seed'),('Guarapari','ES','seed'),('São Mateus','ES','seed'),('Aracruz','ES','seed'),
('Goiânia','GO','seed'),('Aparecida de Goiânia','GO','seed'),('Anápolis','GO','seed'),('Rio Verde','GO','seed'),('Luziânia','GO','seed'),('Águas Lindas de Goiás','GO','seed'),('Valparaíso de Goiás','GO','seed'),('Trindade','GO','seed'),('Formosa','GO','seed'),('Novo Gama','GO','seed'),('Senador Canedo','GO','seed'),('Itumbiara','GO','seed'),('Jataí','GO','seed'),('Catalão','GO','seed'),('Planaltina','GO','seed'),
('São Luís','MA','seed'),('Imperatriz','MA','seed'),('São José de Ribamar','MA','seed'),('Timon','MA','seed'),('Caxias','MA','seed'),('Codó','MA','seed'),('Paço do Lumiar','MA','seed'),('Açailândia','MA','seed'),('Bacabal','MA','seed'),('Balsas','MA','seed'),
('Cuiabá','MT','seed'),('Várzea Grande','MT','seed'),('Rondonópolis','MT','seed'),('Sinop','MT','seed'),('Tangará da Serra','MT','seed'),('Cáceres','MT','seed'),('Sorriso','MT','seed'),('Lucas do Rio Verde','MT','seed'),('Primavera do Leste','MT','seed'),('Barra do Garças','MT','seed'),('Alta Floresta','MT','seed'),('Campo Novo do Parecis','MT','seed'),('Pontes e Lacerda','MT','seed'),('Nova Mutum','MT','seed'),('Juína','MT','seed'),('Colíder','MT','seed'),('Guarantã do Norte','MT','seed'),('Juara','MT','seed'),('Peixoto de Azevedo','MT','seed'),('Sapezal','MT','seed'),
('Campo Grande','MS','seed'),('Dourados','MS','seed'),('Três Lagoas','MS','seed'),('Corumbá','MS','seed'),('Ponta Porã','MS','seed'),('Naviraí','MS','seed'),('Nova Andradina','MS','seed'),('Aquidauana','MS','seed'),('Sidrolândia','MS','seed'),('Paranaíba','MS','seed'),
('Belo Horizonte','MG','seed'),('Uberlândia','MG','seed'),('Contagem','MG','seed'),('Juiz de Fora','MG','seed'),('Betim','MG','seed'),('Montes Claros','MG','seed'),('Ribeirão das Neves','MG','seed'),('Uberaba','MG','seed'),('Governador Valadares','MG','seed'),('Ipatinga','MG','seed'),('Sete Lagoas','MG','seed'),('Divinópolis','MG','seed'),('Santa Luzia','MG','seed'),('Ibirité','MG','seed'),('Poços de Caldas','MG','seed'),('Patos de Minas','MG','seed'),('Pouso Alegre','MG','seed'),('Teófilo Otoni','MG','seed'),('Barbacena','MG','seed'),('Sabará','MG','seed'),('Varginha','MG','seed'),('Conselheiro Lafaiete','MG','seed'),('Vespasiano','MG','seed'),('Pedro Leopoldo','MG','seed'),('Araguari','MG','seed'),('Itabira','MG','seed'),('Passos','MG','seed'),('Coronel Fabriciano','MG','seed'),('Muriaé','MG','seed'),('Ituiutaba','MG','seed'),('Lavras','MG','seed'),
('Belém','PA','seed'),('Ananindeua','PA','seed'),('Santarém','PA','seed'),('Marabá','PA','seed'),('Parauapebas','PA','seed'),('Castanhal','PA','seed'),('Abaetetuba','PA','seed'),('Cametá','PA','seed'),('Marituba','PA','seed'),('Bragança','PA','seed'),
('João Pessoa','PB','seed'),('Campina Grande','PB','seed'),('Santa Rita','PB','seed'),('Patos','PB','seed'),('Bayeux','PB','seed'),('Sousa','PB','seed'),('Cajazeiras','PB','seed'),('Cabedelo','PB','seed'),('Guarabira','PB','seed'),('Sapé','PB','seed'),
('Curitiba','PR','seed'),('Londrina','PR','seed'),('Maringá','PR','seed'),('Ponta Grossa','PR','seed'),('Cascavel','PR','seed'),('São José dos Pinhais','PR','seed'),('Foz do Iguaçu','PR','seed'),('Colombo','PR','seed'),('Guarapuava','PR','seed'),('Paranaguá','PR','seed'),('Araucária','PR','seed'),('Toledo','PR','seed'),('Apucarana','PR','seed'),('Pinhais','PR','seed'),('Campo Largo','PR','seed'),('Arapongas','PR','seed'),('Almirante Tamandaré','PR','seed'),('Umuarama','PR','seed'),('Piraquara','PR','seed'),('Cambé','PR','seed'),
('Recife','PE','seed'),('Jaboatão dos Guararapes','PE','seed'),('Olinda','PE','seed'),('Caruaru','PE','seed'),('Petrolina','PE','seed'),('Paulista','PE','seed'),('Cabo de Santo Agostinho','PE','seed'),('Camaragibe','PE','seed'),('Garanhuns','PE','seed'),('Vitória de Santo Antão','PE','seed'),('Igarassu','PE','seed'),('São Lourenço da Mata','PE','seed'),('Abreu e Lima','PE','seed'),('Santa Cruz do Capibaribe','PE','seed'),('Ipojuca','PE','seed'),
('Teresina','PI','seed'),('Parnaíba','PI','seed'),('Picos','PI','seed'),('Piripiri','PI','seed'),('Floriano','PI','seed'),('Campo Maior','PI','seed'),('Barras','PI','seed'),('União','PI','seed'),('Altos','PI','seed'),('Pedro II','PI','seed'),
('Rio de Janeiro','RJ','seed'),('São Gonçalo','RJ','seed'),('Duque de Caxias','RJ','seed'),('Nova Iguaçu','RJ','seed'),('Niterói','RJ','seed'),('Belford Roxo','RJ','seed'),('São João de Meriti','RJ','seed'),('Campos dos Goytacazes','RJ','seed'),('Petrópolis','RJ','seed'),('Volta Redonda','RJ','seed'),('Magé','RJ','seed'),('Itaboraí','RJ','seed'),('Mesquita','RJ','seed'),('Nova Friburgo','RJ','seed'),('Barra Mansa','RJ','seed'),('Macaé','RJ','seed'),('Cabo Frio','RJ','seed'),('Angra dos Reis','RJ','seed'),('Nilópolis','RJ','seed'),('Teresópolis','RJ','seed'),
('Natal','RN','seed'),('Mossoró','RN','seed'),('Parnamirim','RN','seed'),('São Gonçalo do Amarante','RN','seed'),('Ceará-Mirim','RN','seed'),('Macaíba','RN','seed'),('Caicó','RN','seed'),('Açu','RN','seed'),('Currais Novos','RN','seed'),('São José de Mipibu','RN','seed'),
('Porto Alegre','RS','seed'),('Caxias do Sul','RS','seed'),('Canoas','RS','seed'),('Pelotas','RS','seed'),('Santa Maria','RS','seed'),('Gravataí','RS','seed'),('Viamão','RS','seed'),('Novo Hamburgo','RS','seed'),('São Leopoldo','RS','seed'),('Rio Grande','RS','seed'),('Alvorada','RS','seed'),('Passo Fundo','RS','seed'),('Sapucaia do Sul','RS','seed'),('Uruguaiana','RS','seed'),('Santa Cruz do Sul','RS','seed'),('Cachoeirinha','RS','seed'),('Bagé','RS','seed'),('Bento Gonçalves','RS','seed'),('Erechim','RS','seed'),('Guaíba','RS','seed'),
('Porto Velho','RO','seed'),('Ji-Paraná','RO','seed'),('Ariquemes','RO','seed'),('Vilhena','RO','seed'),('Cacoal','RO','seed'),('Jaru','RO','seed'),('Rolim de Moura','RO','seed'),('Guajará-Mirim','RO','seed'),('Ouro Preto do Oeste','RO','seed'),('Buritis','RO','seed'),
('Boa Vista','RR','seed'),('Rorainópolis','RR','seed'),('Caracaraí','RR','seed'),
('Florianópolis','SC','seed'),('Joinville','SC','seed'),('Blumenau','SC','seed'),('São José','SC','seed'),('Chapecó','SC','seed'),('Criciúma','SC','seed'),('Itajaí','SC','seed'),('Jaraguá do Sul','SC','seed'),('Lages','SC','seed'),('Palhoça','SC','seed'),('Balneário Camboriú','SC','seed'),('Brusque','SC','seed'),('Tubarão','SC','seed'),('São Bento do Sul','SC','seed'),('Caçador','SC','seed'),('Concórdia','SC','seed'),('Camboriú','SC','seed'),('Navegantes','SC','seed'),('Rio do Sul','SC','seed'),('Araranguá','SC','seed'),
('São Paulo','SP','seed'),('Guarulhos','SP','seed'),('Campinas','SP','seed'),('São Bernardo do Campo','SP','seed'),('Santo André','SP','seed'),('São José dos Campos','SP','seed'),('Osasco','SP','seed'),('Ribeirão Preto','SP','seed'),('Sorocaba','SP','seed'),('Mauá','SP','seed'),('São José do Rio Preto','SP','seed'),('Mogi das Cruzes','SP','seed'),('Santos','SP','seed'),('Diadema','SP','seed'),('Jundiaí','SP','seed'),('Piracicaba','SP','seed'),('Carapicuíba','SP','seed'),('Bauru','SP','seed'),('Itaquaquecetuba','SP','seed'),('São Vicente','SP','seed'),('Franca','SP','seed'),('Praia Grande','SP','seed'),('Guarujá','SP','seed'),('Taubaté','SP','seed'),('Limeira','SP','seed'),('Suzano','SP','seed'),('Taboão da Serra','SP','seed'),('Sumaré','SP','seed'),('Embu das Artes','SP','seed'),('Barueri','SP','seed'),('Americana','SP','seed'),('Marília','SP','seed'),('Jacareí','SP','seed'),('Araraquara','SP','seed'),('Presidente Prudente','SP','seed'),('Santa Bárbara d''Oeste','SP','seed'),('Rio Claro','SP','seed'),('Cotia','SP','seed'),('Indaiatuba','SP','seed'),('Hortolândia','SP','seed'),('Araçatuba','SP','seed'),('Ferraz de Vasconcelos','SP','seed'),('São Carlos','SP','seed'),('Francisco Morato','SP','seed'),('Itapecerica da Serra','SP','seed'),('Itapevi','SP','seed'),('Bragança Paulista','SP','seed'),('Mogi Guaçu','SP','seed'),('Itu','SP','seed'),('Pindamonhangaba','SP','seed'),('Barretos','SP','seed'),('Catanduva','SP','seed'),('Cubatão','SP','seed'),('Sertãozinho','SP','seed'),('Jandira','SP','seed'),('Atibaia','SP','seed'),('Birigui','SP','seed'),('Ribeirão Pires','SP','seed'),('Valinhos','SP','seed'),('Poá','SP','seed'),('Salto','SP','seed'),('Jaú','SP','seed'),('Assis','SP','seed'),('Ourinhos','SP','seed'),('Leme','SP','seed'),('Botucatu','SP','seed'),('São Caetano do Sul','SP','seed'),('Votorantim','SP','seed'),('Paulínia','SP','seed'),('Votuporanga','SP','seed'),('Itatiba','SP','seed'),('Bebedouro','SP','seed'),('Caraguatatuba','SP','seed'),('Itapetininga','SP','seed'),('São Sebastião','SP','seed'),('Ubatuba','SP','seed'),('Registro','SP','seed'),('Campos do Jordão','SP','seed'),
('Aracaju','SE','seed'),('Nossa Senhora do Socorro','SE','seed'),('Lagarto','SE','seed'),('Itabaiana','SE','seed'),('São Cristóvão','SE','seed'),('Estância','SE','seed'),('Tobias Barreto','SE','seed'),('Simão Dias','SE','seed'),('Propriá','SE','seed'),('Capela','SE','seed'),
('Palmas','TO','seed'),('Araguaína','TO','seed'),('Gurupi','TO','seed'),('Porto Nacional','TO','seed'),('Paraíso do Tocantins','TO','seed'),('Colinas do Tocantins','TO','seed'),('Guaraí','TO','seed'),('Tocantinópolis','TO','seed'),('Dianópolis','TO','seed'),('Miracema do Tocantins','TO','seed')
ON CONFLICT (normalized_name, state) DO NOTHING;
