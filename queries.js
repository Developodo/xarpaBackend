const fs = require("fs");
const crypto = require("crypto");
const fcm = require("./fcm");
const cloudinary = require("./cloudinary");
const Promise = require("promise");
const escape = require("sqlutils/pg/escape");
const osmsm = require("osm-static-maps");
const Pool = require("pg").Pool;
const pool = new Pool({
  user: "postgres",
  host: "containers-us-west-72.railway.app",
  database: "railway",
  password: "4GeyHL5ZK2Uu6vyhC8eO",
  port: 6186,
  ssl:{
    rejectUnauthorized:false
  }
});
//wtf
function bezier(t, p0, p1, p2, p3) {
  let cX = 3 * (p1[0] - p0[0]),
    bX = 3 * (p2[0] - p1[0]) - cX,
    aX = p3[0] - p0[0] - cX - bX;

  let cY = 3 * (p1[1] - p0[1]),
    bY = 3 * (p2[1] - p1[1]) - cY,
    aY = p3[1] - p0[1] - cY - bY;

  let x = aX * Math.pow(t, 3) + bX * Math.pow(t, 2) + cX * t + p0[0];
  let y = aY * Math.pow(t, 3) + bY * Math.pow(t, 2) + cY * t + p0[1];

  //return {x: x, y: y};
  return [x, y];
}
function doBezier(path, accu) {
  let newPath = [];
  if (path.length > 3) {
    for (let i = 0; i < path.length - 3; i += 3) {
      for (var j = 0; j < 1; j += accu) {
        let p = bezier(j, path[i], path[i + 1], path[i + 2], path[i + 3]);
        newPath.push(p);
      }
    }
  } else {
    newPath = path;
  }
  return newPath;
}

const getActivities = (request, response) => {
  pool.query("SELECT * FROM test.track ORDER BY id ASC", (error, results) => {
    if (error) {
      throw error;
    }
    response.status(200).json(results.rows);
  });
};

const getActivityByOwner = (request, response) => {
  let n = request.query.name;
  let t = request.query.type;
  let r = request.query.range;
  let to = request.query.to;
  let from = request.query.from;

  let where = "";
  if (n && n.length > 0) {
    where += ` AND t.name ILIKE '%${n}%' `;
  }
  if (t && Number.parseInt(t) >= 0) {
    where += ` AND t.atype=${t} `;
  }
  if (r && Number.parseInt(r) > 0) {
    if (Number.parseInt(r) < 150) {
      where += ` AND t.distance<=${+r + 5} AND t.distance>=${r - 5} `;
    } else {
      where += ` AND t.distance>=${r} `;
    }
  }
  if (to && to != "" && from && from != "") {
    where += ` AND t.timeini>='${from}' AND t.timeini<='${to}'`;
  }

  const owner = request.params.owner;
  let page = parseInt(request.params.page);
  if (!page || page <= 0) {
    page = 1;
  }
  const limit = 5;
  const offset = (page - 1) * 5;
  //OLD -> SELECT id,name,distance,average,atype,timeini,pointstart,owner,encode(image, 'base64') as image,asce FROM test.track WHERE owner = $1 ORDER BY timeini DESC LIMIT $2 OFFSET $3;
  //SELECT id,name,distance,average,atype,timeini,pointstart,owner,encode(image, 'base64') as image,asce,ARRAY_LENGTH(l.id_users,1) as likes FROM test.track as t LEFT JOIN test.likes as l ON l.id_track=t.id WHERE owner = 1 ORDER BY timeini DESC;
  //SELECT id,name,distance,average,atype,timeini,pointstart,owner,encode(image, 'base64') as image,asce,ARRAY_LENGTH(l.id_users,1) as likes,COUNT(c.id_track) FROM test.track as t LEFT JOIN test.likes as l ON l.id_track=t.id LEFT JOIN test.comments as c ON c.id_track=t.id WHERE owner = $1 GROUP BY t.id,l.id_users ORDER BY timeini DESC LIMIT $2 OFFSET $3;
  //LAST GREAT "SELECT id,name,distance,average,atype,timeini,pointstart,owner,encode(image, 'base64') as image,asce,ARRAY_LENGTH(l.id_users,1) as likes,l.id_users as wholikes,COUNT(c.id_track) FROM test.track as t LEFT JOIN test.likes as l ON l.id_track=t.id LEFT JOIN test.comments as c ON c.id_track=t.id WHERE owner = $1 GROUP BY t.id,l.id_users ORDER BY timeini DESC LIMIT $2 OFFSET $3;"

  pool.query(
    `SELECT t.id as id,t.name as name,distance,average,atype,timeini,pointstart,owner as ownerid, u.name as ownername, 
    u.avatar as owneravatar,image,
    asce,ARRAY_LENGTH(l.id_users,1) as likes,l.id_users::text[] as wholikes,
    COUNT(c.id_track) as comments,
    to_jsonb(properties->>'track')
    AS geometry,
    (
      SELECT array_to_json(array_agg('[' || p.id1 || ',' || p.id2 || ',' 
      || p.owner1 || ',' || p.owner2 || 
      ',' ||p.name1|| ',' ||p.name2 || ','
      || COALESCE(p.avatar1,'') || ',' || COALESCE(p.avatar2,'') || ']')) as pals  
          FROM test.pals as p WHERE p.id1=t.id OR p.id2=t.id
      ) as pals,
      (
        SELECT array_to_json(array_agg('[' || w.id || ',' || w.id_activity || ',' 
        || w.wtype || ',' || (w.data)::text || ']')) as awards  
            FROM test.awards as w WHERE w.id_activity=t.id
        ) as awards
    FROM test.track as t 
    LEFT JOIN test.likes as l ON l.id_track=t.id 
    LEFT JOIN test.comments as c ON c.id_track=t.id 
    LEFT JOIN test.users as u ON t.owner=u.id 
    WHERE t.owner = $1 ${where} 
    GROUP BY t.id,l.id_users,u.name,u.avatar 
    ORDER BY timeini DESC LIMIT $2 OFFSET $3;`,
    [owner, limit, offset],
    (error, results) => {
      if (error) {
        throw error;
      }
      /*fs.writeFile('mockData.json', JSON.stringify(results.rows), function (err,data) {
        if (err) {
          return console.log(err);
        }
        //console.log(data);
      });*/
      //console.log(results.rows);
      response.status(200).json(results.rows);
    }
  );
};
const getOneActivityById = (request, response) => {
  const id = request.params.id;

  pool.query(
    `SELECT t.id as id,t.name as name,distance,average,atype,timeini,pointstart,owner as ownerid, u.name as ownername, 
    u.avatar as owneravatar,image,
    asce,ARRAY_LENGTH(l.id_users,1) as likes,l.id_users::text[] as wholikes,
    COUNT(c.id_track) as comments,
    to_jsonb(properties->>'track')
    AS geometry,
    (
      SELECT array_to_json(array_agg('[' || p.id1 || ',' || p.id2 || ',' 
      || p.owner1 || ',' || p.owner2 || 
      ',' ||p.name1|| ',' ||p.name2 || ','
      || COALESCE(p.avatar1,'') || ',' || COALESCE(p.avatar2,'') || ']')) as pals  
          FROM test.pals as p WHERE p.id1=t.id OR p.id2=t.id
      ) as pals
    FROM test.track as t 
    LEFT JOIN test.likes as l ON l.id_track=t.id 
    LEFT JOIN test.comments as c ON c.id_track=t.id 
    LEFT JOIN test.users as u ON t.owner=u.id 
    WHERE t.id=$1 
    GROUP BY t.id,l.id_users,u.name,u.avatar;`,
    [id],
    (error, results) => {
      if (error) {
        throw error;
      }
      /*fs.writeFile('mockData.json', JSON.stringify(results.rows), function (err,data) {
        if (err) {
          return console.log(err);
        }
        //console.log(data);
      });*/
      //console.log(results.rows);
      response.status(200).json(results.rows);
    }
  );
};
getActivityContacts = (request, response) => {
  const owner = request.params.owner;
  let page = parseInt(request.params.page);
  if (!page || page <= 0) {
    page = 1;
  }
  const limit = 7;
  const offset = (page - 1) * 7;

  let n = request.query.name;
  let t = request.query.type;
  let r = request.query.range;
  let to = request.query.to;
  let from = request.query.from;

  let where = "";
  if (n && n.length > 0) {
    where += ` AND t.name ILIKE '%${n}%' `;
  }
  if (t && Number.parseInt(t) >= 0) {
    where += ` AND t.atype=${t} `;
  }
  if (r && Number.parseInt(r) > 0) {
    if (Number.parseInt(r) < 150) {
      where += ` AND t.distance<=${+r + 5} AND t.distance>=${r - 5} `;
    } else {
      where += ` AND t.distance>=${r} `;
    }
  }
  if (to && to != "" && from && from != "") {
    where += ` AND t.timeini>='${from}' AND t.timeini<='${to}'`;
  }

  pool.query(
    `SELECT t.id as id,t.name as name,distance,average,atype,timeini,pointstart,owner as ownerid, u.name as ownername, 
    u.avatar as owneravatar,image,
    asce,ARRAY_LENGTH(l.id_users,1) as likes,l.id_users::text[] as wholikes,
    COUNT(c.id_track) as comments,
    to_jsonb(properties->>'track')
    AS geometry,
    (
      SELECT array_to_json(array_agg('[' || p.id1 || ',' || p.id2 || ',' 
      || p.owner1 || ',' || p.owner2 || 
      ',' ||p.name1|| ',' ||p.name2 || ','
      || COALESCE(p.avatar1,'') || ',' || COALESCE(p.avatar2,'') || ']')) as pals  
          FROM test.pals as p WHERE p.id1=t.id OR p.id2=t.id
      ) as pals,
      (
        SELECT array_to_json(array_agg('[' || w.id || ',' || w.id_activity || ',' 
        || w.wtype || ',' || (w.data)::text || ']')) as awards  
            FROM test.awards as w WHERE w.id_activity=t.id
        ) as awards
    FROM test.track as t 
    LEFT JOIN test.likes as l ON l.id_track=t.id 
    LEFT JOIN test.comments as c ON c.id_track=t.id 
    LEFT JOIN test.users as u ON t.owner=u.id 
    WHERE owner IN (SELECT id_followed FROM test.followers WHERE id_follower=$1 UNION
      SELECT ${owner}) ${where}
    GROUP BY t.id,l.id_users,u.name,u.avatar,t.name 
    ORDER BY timeini DESC LIMIT $2 OFFSET $3;`,
    [owner, limit, offset],
    (error, results) => {
      if (error) {
        throw error;
      }
      //console.log(results.row)
      const size = Buffer.byteLength(JSON.stringify(results.rows));
      console.log("Sin comprimir " + size);
      response.status(200).json(results.rows);
    }
  );
};

const getActivityById = (request, response) => {
  const id = request.params.id;
  let q = `
  SELECT jsonb_build_object(
    'type',     'FeatureCollection',
    'features', jsonb_agg(features.feature)
) as data
FROM (
  SELECT jsonb_build_object(
    'type',       'Feature',
    'id',         inputs.id,
    'geometry',   ST_AsGeoJSON(inputs.path)::jsonb,
    'properties', to_jsonb(inputs.properties),
'owner', to_jsonb(inputs.jowner),
'routes', inputs.routes,
'social', inputs.social,
'image', inputs.image,
'mytracks',inputs.mytracks,
'awards',inputs.awards,
'palstracks',inputs.palstracks
  ) AS feature
  FROM (SELECT t.*, row_to_json(ROW(u.id::text,u.name,COALESCE(u.avatar,''),u.email)) as jowner,
  routes.routes as routes,
  x.social,
  (
    SELECT array_to_json(array_agg('[' || p.id1 || ',' || p.id2 || ',' 
    || p.owner1 || ',' || p.owner2 || 
    ',' ||p.name1|| ',' ||p.name2 || ','
    || COALESCE(p.avatar1,'') || ',' || COALESCE(p.avatar2,'') || ']')) as pals  
        FROM test.pals as p WHERE p.id1=$1 OR p.id2=$1
    ) as palstracks,
    (
      SELECT array_to_json(array_agg('[' || t.id || ',' || t.distance || ',' 
      || t.average || ',' || (t.properties->>'time_ini')::text || 
      ',' ||t.owner || ']')) as mines  
          FROM test.track as t WHERE t.id IN 
		  (SELECT id2 FROM test.coincidences WHERE id1=$1 UNION SELECT id1 FROM test.coincidences WHERE id2=$1)
      ) as mytracks,
      (
        SELECT array_to_json(array_agg('[' || w.id || ',' || w.id_activity || ',' 
        || w.wtype || ',' || (w.data)::text || ']')) as awards  
            FROM test.awards as w WHERE w.id_activity=$1
        ) as awards
  FROM test.track as t
    LEFT JOIN test.users as u ON t.owner=u.id
  LEFT JOIN (
   SELECT tt.id as id,
  row_to_json(row(ARRAY_LENGTH(l.id_users,1),
  l.id_users::text[],
    COUNT(c.id_track))) as social
  FROM test.track tt 
  LEFT JOIN test.likes as l ON l.id_track=tt.id 
  LEFT JOIN test.comments as c ON c.id_track=tt.id
  WHERE tt.id=$1 GROUP BY l.id_users,tt.id
  ) x ON t.id=x.id
  LEFT JOIN (
      SELECT array_to_json(array_agg('[' || ru.id_route|| ',' ||rur.name|| ',' ||ru.time|| ']')) as routes, 
      ru.id_track as id_track 
      FROM test.routesusers as ru
      LEFT JOIN test.routes as rur ON ru.id_route=rur.id
      WHERE ru.id_track=$1
      GROUP BY ru.id_track							
  ) routes ON t.id=routes.id_track  
  WHERE t.id=$1) inputs) features
    `;
  //console.log(q);
  pool.query(q, [id], (error, results) => {
    //console.log(results.rows)
    if (error) {
      throw error;
    }
    response.status(200).json(results.rows);
  });
};

const getPictureFromActivity = (request, response) => {
  const id = request.params.id;
  let q = `
  SELECT t.id as id,t.name as name,distance,average,atype,
  timeini,
  u.name as ownername, 
  u.avatar as owneravatar,
  asce,
  to_jsonb(properties->>'track')
  AS geometry
  FROM test.track as t 
  LEFT JOIN test.users as u
  ON t.owner=u.id
  WHERE t.id = $1`;
  //console.log(q);
  pool.query(q, [id], (error, results) => {
    //console.log(results.rows)
    if (error) {
      throw error;
    }
    let pathS = {
      type: "LineString",
    };
    let newGeometry = minimalPath(JSON.parse(results.rows[0].geometry));
    pathS.coordinates = doBezier(newGeometry, 0.25);
    pathS.pathOptions = {
      weight: 7,
      color: "#FF0000",
      opacity: 1,
    };
    osmsm({
      geojson: pathS,
      quality: 50,
      width: 800,
      height: 450,
      maxZoom: 18,
      scale: true,
    }).then((imageBinaryBuffer) => {
      response.status(200).json({
        data:
          "data:image/png;base64," +
          new Buffer(imageBinaryBuffer).toString("base64"),
      });
    });
  });
};
//ojo
//https://github.com/jperelli/osm-static-maps
const createActivity = (request, response) => {
  //APP
  //console.log(request.body.json)
  const input = JSON.parse(request.body.json);

  const data = JSON.stringify(input);
  let q = `
  WITH data AS (SELECT '${data}'::json AS fc)
    INSERT INTO test.track (name, pointStart,timeini,distance,average,asce,atype,owner, path,properties,image)
     SELECT
     (feat->'properties'->>'name')::text as name,
     ST_TRANSFORM(ST_SetSRID(ST_Point((feat->'properties'->'pointStart'->>'lat')::float,
            (feat->'properties'->'pointStart'->>'lng')::float),4326),3857) as pointStart,
     (feat->'properties'->>'time_ini')::timestamp as timeini,
     (feat->'properties'->>'distance')::numeric as distance,
     (feat->'properties'->>'avg_speed')::numeric as average,
     (feat->'properties'->>'elevationA')::numeric as asce,
     (feat->'properties'->>'type')::int as atype,
    (feat->'properties'->>'owner')::numeric as owner,
    ST_TRANSFORM(ST_SetSRID(ST_GeomFromGeoJSON(feat->>'geometry'),4326),3857) AS path,
    feat->'properties' AS properties,
    '' as image
  FROM (
    SELECT json_array_elements(fc->'features') AS feat
    FROM data
  ) AS f RETURNING id;`;
  //console.log(q)
  pool.query(q, async (error, result) => {
    if (error) {
      throw error;
    }
    //console.log(result)
    if (result.rows) {
      //console.log("Aqui"+result.rows[0].id)
      await addEliteFunction(result.rows[0].id);
      //await eliteFunction_whoBeatTheMark(result.rows[0].id);
      //await eliteFunctions_whodidtheroute(result.rows[0].id);
      //await eliteFunctions_whowasmypal(result.rows[0].id);
    } 
     response.status(201).send(`User added with ID: ${result.insertId}`);
  });
};

//ojo
const updateActivity = async (request, response) => {
  const id = request.params.id;
  const { name, atype, oldatype, avatar, oldavatar } = JSON.parse(
    request.body.data
  );
  if (name) {
    if (atype != oldatype) {
      await removeEliteFunction(id);
    }
    let q = `UPDATE test.track SET name = '${name}', atype = ${atype}, properties = properties::jsonb || jsonb_build_object('name','${name}','type',${atype}) WHERE id = ${id}`;
    //console.log(q)
    pool.query(q, async (error, results) => {
      if (error) {
        throw error;
      }
      if (atype != oldatype) {
        await addEliteFunction(id);
      }
      response
        .status(200)
        .send(`Activity ${name} (${atype}) modified with ID: ${id}`);
    });
  } else if (avatar) {
    if (oldavatar) {
      let id_public = oldavatar.split("/");
      if (id_public.length > 0) {
        id_public = id_public[id_public.length - 1];
        id_public = id_public.split(".");
        id_public = id_public[0];
        if (id_public.length < 256) {
          try {
            await cloudinary.removeFile(id_public);
            //console.log("DONE");
          } catch (err) {
            console.log(err);
          }
        }
        //console.log(id_public);
      }
    }

    if (avatar != "x") {
      cloudinary
        .uploadFile(avatar, { width: 800, height: 640, crop: "fill" })
        .then((d) => {
          q = `UPDATE test.track SET image = '${d}' WHERE id = ${id}`;
          pool.query(q, [], (error, results) => {
            if (error) {
              throw error;
            }
            response.status(200).send(d);
          });
        })
        .catch((err) => {
          console.log(err);
          response.status(200).send(null);
        });
    } else {
      q = `UPDATE test.track SET image = '' WHERE id = ${id}`;
      pool.query(q, [], (error, results) => {
        if (error) {
          throw error;
        }
        response.status(200).send(null);
      });
    }
  }
};

const deleteActivity = (request, response) => {
  const id = request.params.id;
  let q = `BEGIN;
  DELETE FROM test.routesusers WHERE id_track=${id};
  DELETE FROM test.likes WHERE id_track=${id}; 
  DELETE FROM test.comments WHERE id_track=${id}; 
  DELETE FROM test.news WHERE (ntype=1 OR ntype=2) AND id_rel=${id};
  DELETE FROM test.track WHERE id = ${id}; 
  DELETE FROM test.pals WHERE id1= ${id} OR id2=${id};  
  DELETE FROM test.coincidences WHERE id1= ${id} OR id2=${id};
  DELETE FROM test.awards WHERE id_activity= ${id};
  COMMIT;`;
  //console.log(q)
  pool.query(q, (error, results) => {
    if (error) {
      throw error;
    }
    response.status(200).send(`Activity deleted with ID: ${id}`);
  });
};

const likeActivity = (request, response) => {
  const { idactivity, iduser } = request.body;

  let q = `BEGIN; INSERT INTO test.likes as t (id_track, id_users) 
      VALUES (${idactivity}, ARRAY[${iduser}])
      ON CONFLICT (id_track) DO UPDATE SET id_users =(select array_agg(distinct e) 
                              from unnest(t.id_users || EXCLUDED.id_users) e)
        where not EXCLUDED.id_users @> t.id_users;
        INSERT INTO test.news (ntype,data,time,id_rel,id_user) VALUES 
        (1,'A un usuario le gusta tu actividad',NOW(),${idactivity},(SELECT t.owner FROM
          test.track t WHERE t.id=${idactivity}));
          SELECT name,avatar,(SELECT token FROM test.users as u 
            INNER JOIN test.track as t ON t.owner=u.id WHERE t.id=${idactivity}) as token,
            (SELECT name FROM test.track WHERE id=${idactivity}) as activityname,
            (SELECT coalesce(array_length(id_users, 1), 0) FROM test.likes as l 
             WHERE l.id_track=${idactivity}) as nlikes,avatar 
            FROM test.users WHERE id=${iduser};
        COMMIT`;
  //console.log(q)
  pool.query(q, (error, result) => {
    if (error) {
      throw error;
    }

    if (result[3].rows.length > 0 && result[3].rows[0].name) {
      let uname = result[3].rows[0].name;
      let uavatar = result[3].rows[0].avatar;
      let utoken = result[3].rows[0].token;
      let sentence =
        "A " +
        uname +
        " le gusta tu actividad: " +
        result[3].rows[0].activityname;
      if (result[3].rows[0].nlikes > 1) {
        sentence =
          "A " +
          uname +
          " y " +
          (result[3].rows[0].nlikes - 1) +
          " usuario" +
          (result[3].rows[0].nlikes - 1 > 1 ? "s" : "") +
          " más les gusta tu actividad: " +
          result[3].rows[0].activityname;
      }
      fcm.sendMessage(
        [utoken],
        "Nuevo me gusta",
        sentence,
        "activity",
        idactivity,
        uavatar,
        "l" + idactivity
      );
    }

    response.status(201).send(`User liked with ID: ${result.insertId}`);
  });
};
const showLikes = (request, response) => {
  const id = request.params.id;
  let q = `SELECT s.id_track,i.* AS idx
    FROM test.likes s
    LEFT JOIN test.users i ON i.id = ANY(s.id_users) WHERE s.id_track=${id}`;

  pool.query(q, (error, result) => {
    if (error) {
      throw error;
    }
    response.status(200).json(result.rows);
  });
};

const getCommentsActitivity = (request, response) => {
  const id = request.params.id;
  let q = `(SELECT COALESCE(ARRAY_LENGTH(l.id_users,1),0) as id_user,t.name as text,(t.properties->>'time_ini')::timestamp as time,0 as id_track,
  0 as id ,0 as userid,'' as username,'' as useravatar FROM test.likes as l 
  RIGHT JOIN test.track as t ON t.id=l.id_track WHERE t.id=${id} ORDER BY time ASC )
  UNION ALL
  (
  SELECT c.*,u.id as userid,u.name as username, 
            u.avatar as useravatar  
        FROM test.comments as c 
            LEFT JOIN test.users as u ON c.id_user=u.id 
            WHERE c.id_track=${id}  
        ORDER BY c.time ASC
    )`;

  pool.query(q, (error, result) => {
    if (error) {
      throw error;
    }
    response.status(200).json(result.rows);
  });
};

const commentActivity = (request, response) => {
  const { idactivity, iduser, text } = request.body;

  let q = `BEGIN;
  INSERT into test.comments (id_track,id_user,text,time) 
  VALUES (${idactivity},${iduser},${escape(text)}, current_timestamp);
  INSERT INTO test.news (ntype,data,time,id_rel,id_user) SELECT 
  2,'Un usuario ha comentado tu actividad',NOW(),${idactivity},t.owner 
  FROM test.track t WHERE t.id=${idactivity} AND t.owner <> ${iduser};
  SELECT u.name,(SELECT token FROM test.users as u2 
    INNER JOIN test.track as t ON t.owner=u2.id WHERE t.id=${idactivity}) as token,
    u.token as mytoken,
    u.avatar as avatar,
    (SELECT name from test.track WHERE id=${idactivity}) as activityname,
	 (SELECT array_to_json(array_agg(distinct uu3.token)) FROM test.comments as c 
	  JOIN test.users as uu3 ON c.id_user=uu3.id
	  WHERE c.id_track=${idactivity} AND c.id_user <> ${iduser}
	  AND c.id_user <> (SELECT owner FROM test.track as tt2 WHERE tt2.id=${idactivity})) as others
    FROM test.users as u  WHERE u.id=${iduser};
  COMMIT`;
  //console.log(q);

  pool.query(q, (error, result) => {
    if (error) {
      throw error;
    }
    if (result[3].rows.length > 0 && result[3].rows[0].name) {
      let uname = result[3].rows[0].name;
      let uavatar = result[3].rows[0].avatar;
      let utoken = result[3].rows[0].token;

      let n = 0;
      let sentence = "";
      if (result[3].rows[0].others && result[3].rows[0].others.length > 0) {
        sentence =
          "Nuevo comentario de " +
          uname +
          " en la actividad: " +
          result[3].rows[0].activityname;
        fcm.sendMessage(
          result[3].rows[0].others,
          "Nuevo Comentario",
          sentence,
          "activity",
          idactivity,
          uavatar,
          "c" + idactivity
        );
        n = result[3].rows[0].others.length;
      }

      sentence =
        "" +
        uname +
        " ha comentado una de tus actividades: " +
        result[3].rows[0].activityname;
      if (n > 0) {
        sentence =
          "" +
          uname +
          " y " +
          n +
          " " +
          (n > 1 ? "ha comentado" : "han comentado") +
          " una de tus actividades: " +
          result[3].rows[0].activityname;
      }
      if (utoken != result[3].rows[0].mytoken)
        fcm.sendMessage(
          [utoken],
          "Nuevo Comentario",
          sentence,
          "activity",
          idactivity,
          uavatar,
          "c" + idactivity
        );
    }
    response.status(201).send(`User comment with ID: ${result.insertId}`);
  });
};

const delcommentActivity = (request, response) => {
  //const id = parseInt(request.params.id);
  const id = request.params.id;

  pool.query(
    "DELETE FROM test.comments WHERE id = $1",
    [id],
    (error, results) => {
      if (error) {
        throw error;
      }
      response.status(200).send(`Comment deleted with ID: ${id}`);
    }
  );
};

const createUser = (request, response) => {
  const input = JSON.parse(request.body.json);
  if (!input.token) input.token = "";
  let q = `WITH cte AS (
      INSERT INTO test.users (id, name, avatar,email,token)
      values (${input.id}, ${escape(input.name)}, '${input.avatar}', ${escape(
    input.email
  )}, '${input.token}')
      ON CONFLICT (id) DO NOTHING
      RETURNING id as id
   )
   SELECT NULL as id,NULL as name,NULL as avatar,NULL as token 
   WHERE EXISTS (SELECT 1 as id FROM cte)          -- success
   UNION ALL
   SELECT id,name,avatar,token
   FROM test.users as e 
   WHERE id = ${input.id}
     AND NOT EXISTS (SELECT 1 FROM cte);     -- conflict
    `;

  pool.query(q, (error, result) => {
    if (error) {
      throw error;
    }
    //console.log(result.rows);
    response.status(201).send(result.rows);
  });
};

const getUser = (request, response) => {};
const getUserByName = (request, response) => {
  const name = request.params.name;
  let q = `SELECT array_to_json(array_agg('[' || id|| ',' ||name|| ',' || COALESCE(avatar,'null') ||']')) from test.users WHERE name ILIKE '%${name}%' LIMIT 20`;
  pool.query(q, (error, result) => {
    if (error) {
      throw error;
    }
    //console.log(result)
    response.status(200).json(result.rows);
  });
};

const getContactsByUser = (request, response) => {
  const id = request.params.id;
  let name = request.params.name;
  let q = "";

  let qname = "";
  if (name && name != "" && name != "-1") {
    qname = name;
  }

  q += `
(
SELECT array_agg('["' || u.id|| '","' ||u.name|| '","' || COALESCE(u.avatar,'null') || '",' ||
(COALESCE((SELECT array_to_json(array_agg(f1.id_followed::text)) FROM test.followers as f1 WHERE f1.id_follower=u.id),'null')) || 
',' ||
(COALESCE((SELECT array_to_json(array_agg(f1.id_follower::text)) FROM test.followers as f1 WHERE f1.id_followed=u.id),'null'))
||  ',1 ]') from test.users as u WHERE
  u.id IN (
  SELECT f3.id_follower FROM test.followers as f3 WHERE f3.id_followed=${id}
 UNION
    SELECT f4.id_followed FROM test.followers as f4 WHERE f4.id_follower=${id}
  ) 
  AND u.name ILIKE '%${qname}%' )
UNION
(SELECT array_agg('["' || u.id|| '","' ||u.name|| '","' || COALESCE(u.avatar,'null') || '",' ||
(COALESCE((SELECT array_to_json(array_agg(f1.id_followed::text)) FROM test.followers as f1 WHERE f1.id_follower=u.id),'null')) || 
',' ||
(COALESCE((SELECT array_to_json(array_agg(f1.id_follower::text)) FROM test.followers as f1 WHERE f1.id_followed=u.id),'null'))
||  ',2 ]') from test.users as u WHERE
  u.id IN (
    (SELECT f5.id_follower FROM test.followers as f5 WHERE f5.id_followed IN (
  SELECT f3.id_follower FROM test.followers as f3 WHERE f3.id_followed=${id}
 UNION
    SELECT f4.id_followed FROM test.followers as f4 WHERE f4.id_follower=${id}
  )
    )
    UNION
     (SELECT f5.id_followed FROM test.followers as f5 WHERE f5.id_follower IN (
  SELECT f3.id_follower FROM test.followers as f3 WHERE f3.id_followed=${id}
 UNION
    SELECT f4.id_followed FROM test.followers as f4 WHERE f4.id_follower=${id}
  )
    ) ) AND u.name ILIKE '%${qname}%' LIMIT 50)
UNION (
SELECT array_agg('["' || u.id|| '","' ||u.name|| '","' || COALESCE(u.avatar,'null') || '",' ||
(COALESCE((SELECT array_to_json(array_agg(f1.id_followed::text)) FROM test.followers as f1 WHERE f1.id_follower=u.id),'null')) || 
',' ||
(COALESCE((SELECT array_to_json(array_agg(f1.id_follower::text)) FROM test.followers as f1 WHERE f1.id_followed=u.id),'null'))
||  ',3 ]') from test.users as u WHERE
  u.id IN (
  (WITH data AS(
   SELECT pointstart FROM test.track as t
   WHERE t.owner=${id} LIMIT 1)
    SELECT distinct(t2.owner) FROM test.track as t2,data WHERE 
    ST_DISTANCE(ST_SetSRID(data.pointstart,3857), t2.pointstart) < 20000 AND t2.owner!=${id}  LIMIT 50
 )   )AND u.name ILIKE '%${qname}%' )
  
`;

  if (qname && qname != "" && qname != "-1") {
    q += ` UNION (SELECT array_agg('["' || u.id|| '","' ||u.name|| '","' || COALESCE(u.avatar,'null') || '",' ||
    (COALESCE((SELECT array_to_json(array_agg(f1.id_followed::text)) FROM test.followers as f1 WHERE f1.id_follower=u.id),'null')) || 
    ',' ||
    (COALESCE((SELECT array_to_json(array_agg(f1.id_follower::text)) FROM test.followers as f1 WHERE f1.id_followed=u.id),'null'))
    || ',0 ]') from test.users as u WHERE u.name ILIKE '%${qname}%' LIMIT 100) `;
  }
  console.log(q)
  pool.query(q, (error, result) => {
    if (error) {
      throw error;
    }
    //console.log(result)
    response.status(200).json(result.rows);
  });
};

const getUserProfile = (request, response) => {
  const id = request.params.id;

  let q = `SELECT u.*, 
  SUM(CASE WHEN t.atype=0 THEN t.distance ELSE 0 END) as dbike,
  SUM(CASE WHEN t.atype=1 THEN t.distance ELSE 0 END) as dfoot,
  COUNT(t.id) as n,
  SUM(CASE WHEN t.timeini>DATE_TRUNC('week', CURRENT_DATE) AND t.atype=0 THEN t.distance ELSE 0 END) as dbikelastweek,
  SUM(CASE WHEN t.timeini>DATE_TRUNC('week', CURRENT_DATE) AND t.atype=1 THEN t.distance ELSE 0 END) as dfootlastweek,
  SUM(CASE WHEN t.timeini>DATE_TRUNC('month', CURRENT_DATE) AND t.atype=0 THEN t.distance ELSE 0 END) as dbikelastmonth,
  SUM(CASE WHEN t.timeini>DATE_TRUNC('month', CURRENT_DATE) AND t.atype=1 THEN t.distance ELSE 0 END) as dfootlastmonth,
  SUM(CASE WHEN t.timeini>DATE_TRUNC('year', CURRENT_DATE) AND t.atype=0 THEN t.distance ELSE 0 END) as dbikelastyear,
  SUM(CASE WHEN t.timeini>DATE_TRUNC('year', CURRENT_DATE) AND t.atype=1 THEN t.distance ELSE 0 END) as dfootlastyear
  ,
  followeds.ids as followeds
  ,tfollowers.ids as followers,
  txarpas.ids as xarpas,
  tmyxarpas.ids as myxarpas 
  FROM test.users as u 
  LEFT JOIN test.track as t ON u.id=t.owner 
  LEFT JOIN (
      SELECT array_agg(f.id_followed::text) as ids,f.id_follower
      FROM test.followers as f WHERE f.id_follower=${id} GROUP BY f.id_follower
  ) followeds ON u.id=followeds.id_follower 
  LEFT JOIN (
      SELECT array_agg(f.id_follower::text) as ids,f.id_followed
      FROM test.followers as f WHERE f.id_followed=${id} GROUP BY f.id_followed
  ) tfollowers ON u.id=tfollowers.id_followed
  LEFT JOIN (
    SELECT array_agg(x.id_xarpa::text) as ids,x.id_user 
    FROM test.xarpasusers as x WHERE x.id_user=${id} GROUP BY x.id_user
) txarpas ON u.id=txarpas.id_user
LEFT JOIN (
  SELECT array_agg(x.id::text) as ids,x.owner 
  FROM test.xarpas as x WHERE x.owner=${id} GROUP BY x.owner
) tmyxarpas ON u.id=tmyxarpas.owner
  WHERE u.id=${id}
  GROUP BY u.id,u.name,u.avatar,u.email,followeds.ids,tfollowers.ids,txarpas.ids,tmyxarpas.ids`;
  //console.log(q)
  pool.query(q, (error, result) => {
    if (error) {
      throw error;
    }
    response.status(200).json(result.rows);
  });
};
const updateUser = (request, response) => {
  const id = request.params.id;
  //borrar imagen antigua cuando se acutaliza
  const { name, avatar, token, weight, gen, premium, oldavatar } = JSON.parse(
    request.body.data
  );
  let q = "UPDATE test.users SET ";
  let more = false;
  if (name) {
    q += " name='" + name + "' ";
    more = true;
  }
  if (token) {
    //remove oldavatar -> caution with uri
    if (more) {
      q += ", ";
    }
    more = true;
    q += " token= '" + token + "' ";
  }
  if (weight) {
    //remove oldavatar -> caution with uri
    if (more) {
      q += ", ";
    }
    more = true;
    q += " weight= " + weight + " ";
  }
  if (gen == false || gen == true) {
    //remove oldavatar -> caution with uri
    if (more) {
      q += ", ";
    }
    more = true;
    q += " gen= " + gen + " ";
  }
  if (premium == false || premium == true) {
    //remove oldavatar -> caution with uri
    if (more) {
      q += ", ";
    }
    more = true;
    q += " premium= " + premium + " ";
  }
  if (avatar) {
    //remove oldavatar -> caution with uri
    if (more) {
      q += ",";
    }

    /* let nameFile =
      randomValueHex(4) +
      "" +
      randomValueHex(4) +
      "" +
      randomValueHex(4) +
      ".png";

    //let avatar64 = avatar.replace(/^data:image\/\w+;base64,/, "");*/
    if (oldavatar && oldavatar.split) {
      //console.log(oldavatar);
      let id_public = oldavatar.split("/");
      if (id_public.length > 0) {
        id_public = id_public[id_public.length - 1];
        id_public = id_public.split(".");
        id_public = id_public[0];
        //console.log("BORRANDO:" + id_public);
        cloudinary.removeFile(id_public);
        //console.log(id_public);
      }
    }
    cloudinary
      .uploadFile(avatar)
      .then((d) => {
        q += " avatar='" + d + "'";
        q += " WHERE id =" + id;
        pool.query(q, [], (error, results) => {
          if (error) {
            throw error;
          }
          response.status(200).send(d);
        });
      })
      .catch((err) => {
        console.log(err);
        response.status(200).send(null);
      });

    /*fs.writeFile(
      "public/" + nameFile,
      avatar64,
      { encoding: "base64" },
      (err, dataImg) => {
        if (err) {
          nameFile = "default.png";
          //console.log(err);
        }
        q += " avatar='" + "http://192.168.1.129:3000/static/" + nameFile + "'";

        q += " WHERE id =" + id;
        //console.log(q)
        pool.query(q, [], (error, results) => {
          if (error) {
            throw error;
          }
          response.status(200).send(`User modified with ID: ${id}`);
        });
      }
    );*/
  } else {
    q += " WHERE id =" + id;
    //console.log(q);
    pool.query(q, [], (error, results) => {
      if (error) {
        throw error;
      }
      response.status(200).send(`User modified with ID: ${id}`);
    });
  }
};

function randomValueHex(len) {
  return crypto
    .randomBytes(Math.ceil(len / 2))
    .toString("hex") // convert to hexadecimal format
    .slice(0, len)
    .toUpperCase(); // return required number of characters
}

function minimalPath(path) {
  let minimalRoute = [];
  let oriBearing = -1;
  let nhop = 0;
  for (let i = 0; i < path.length; i++) {
    let p = path[i];
    //console.log("OJO"); console.log(p)
    if (i == 0 || i == path.length - 1) {
      minimalRoute.push([p.lng, p.lat]);
      nhop = 0;
      if (p.bearing) {
        oriBearing = p.bearing;
      } else {
        oriBearing = 0;
      }
    } else {
      if ((p.bearing && Math.abs(p.bearing - oriBearing) > 45) || nhop > 30) {
        minimalRoute.push([p.lng, p.lat]);
        if (p.bearing) {
          oriBearing = p.bearing;
        } else {
          oriBearing = 0;
        }
        nhop = 0;
      } else {
        nhop++;
      }
    }
  }
  return minimalRoute;
}

updateToken = (request, response) => {
  const iduser = request.params.iduser;
  const token = request.params.token;

  //console.log(iduser)
  //console.log(token)
  let q = `UPDATE test.users SET token='${token}' WHERE id=${iduser}`;
  //console.log(q);
  pool.query(q, [], (error, results) => {
    if (error) {
      throw error;
    }
    //console.log(results.row)
    response.status(200).json("OK");
  });
};

function decodeBase64Image(dataString) {
  var matches = dataString.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/),
    response = {};

  if (matches.length !== 3) {
    return new Error("Invalid input string");
  }

  response.type = matches[1];
  response.data = new Buffer(matches[2], "base64");

  return response;
}

const createXarpa = (request, response) => {
  const { name, atype, description, position, iduser } = JSON.parse(
    request.body.json
  );
  let q = `INSERT INTO test.xarpas as t (name,atype,description,position, owner,date_ini) 
      VALUES (${escape(name)}, ${atype},${escape(description)}, 
        ST_TRANSFORM(ST_SetSRID(ST_Point(${position.lat}::float,${
    position.lng
  }::float),4326),3857), 
        ${iduser},NOW());`;
  pool.query(q, (error, result) => {
    if (error) {
      throw error;
    }
    response.status(201).send(`Xarpa with ID: ${result.insertId}`);
  });
};

const getXarpas = (request, response) => {
  const id = request.params.id;
  let page = parseInt(request.params.page);
  if (!page || page <= 0) {
    page = 1;
  }
  const limit = 20;
  const offset = (page - 1) * 20;

  let q = `SELECT xo.* FROM test.xarpas as xo 
  WHERE xo.owner=${id}
  UNION
  SELECT x.* FROM test.xarpasusers as xu 
    JOIN test.xarpas as x ON x.id=xu.id_xarpa 
    WHERE xu.id_user=${id} 
    LIMIT ${limit}  OFFSET ${offset};`;

  pool.query(q, (error, result) => {
    if (error) {
      throw error;
    }
    response.status(200).json(result.rows);
  });
};

const getXarpaProfile = (request, response) => {
  const id = request.params.id;

  let q = `SELECT x.*,
  json_build_object('lat',ST_X(ST_TRANSFORM(ST_SetSRID(x.position,3857),4326)),
  'lng',ST_Y(ST_TRANSFORM(ST_SetSRID(x.position,3857),4326))
) as location
  ,(SELECT json_agg(ROW(u.id::text,u.name,u.avatar))
  FROM test.xarpasusers as xu JOIN test.users as u ON xu.id_user=u.id WHERE xu.id_xarpa=${id}  ) 
  as components, u2.avatar as owneravatar, u2.name as ownername
FROM test.xarpas as x JOIN test.users as u2 ON x.owner=u2.id WHERE x.id=${id}`;

  pool.query(q, (error, result) => {
    if (error) {
      throw error;
    }
    response.status(200).json(result.rows);
  });
};
const updateXarpa = (request, response) => {
  const id = request.params.id;
  //borrar imagen antigua cuando se acutaliza
  const { name, avatar, description, oldavatar } = JSON.parse(
    request.body.data
  );
  let q = "UPDATE test.xarpas SET ";
  let more = false;
  if (name) {
    q += " name='" + name + "',description= '" + description + "'";
    more = true;
  }
  if (avatar) {
    //remove oldavatar -> caution with uri
    if (more) {
      q += ",";
    }

    /*
    let nameFile =
      randomValueHex(4) +
      "" +
      randomValueHex(4) +
      "" +
      randomValueHex(4) +
      ".png";

    let avatar64 = avatar.replace(/^data:image\/\w+;base64,/, "");
    */
    if (oldavatar) {
      //console.log("Intentando borrar" + oldavatar);
      let id_public = oldavatar.split("/");
      if (id_public.length > 0) {
        id_public = id_public[id_public.length - 1];
        id_public = id_public.split(".");
        id_public = id_public[0];
        cloudinary.removeFile(id_public);
        //console.log(id_public);
      }
    }

    cloudinary
      .uploadFile(avatar, { width: 500, height: 500, crop: "fill" })
      .then((d) => {
        q += " image='" + d + "'";
        q += " WHERE id =" + id;
        pool.query(q, [], (error, results) => {
          if (error) {
            throw error;
          }
          response.status(200).send(d);
        });
      })
      .catch((err) => {
        console.log(err);
        response.status(200).send(null);
      });
    /*fs.writeFile(
      "public/" + nameFile,
      avatar64,
      { encoding: "base64" },
      (err, dataImg) => {
        if (err) {
          nameFile = "default.png";
          //console.log(err);
        }
        q += " image='" + "http://192.168.1.129:3000/static/" + nameFile + "'";

        q += " WHERE id =" + id;
        //console.log(q)
        pool.query(q, [], (error, results) => {
          if (error) {
            throw error;
          }
          response.status(200).send(`Xarpa modified with ID: ${id}`);
        });
      }
    );*/
  } else {
    q += " WHERE id =" + id;
    //console.log(q);
    pool.query(q, [], (error, results) => {
      if (error) {
        throw error;
      }
      response.status(200).send(`Xarpa modified with ID: ${id}`);
    });
  }
};
const subscribeXarpa = (request, response) => {
  const id = request.params.id;
  const user = request.params.user;

  let q = `INSERT INTO test.xarpasusers (id_xarpa, id_user) 
      VALUES (${id}, ${user})`;

  pool.query(q, (error, result) => {
    if (error) {
      throw error;
    }
    response.status(201).send(`user subscribed`);
  });
};
const unsubscribeXarpa = (request, response) => {
  const id = request.params.id;
  const user = request.params.user;
  let q = `DELETE FROM test.xarpasusers WHERE id_xarpa=${id} AND id_user=${user}`;

  pool.query(q, (error, result) => {
    if (error) {
      throw error;
    }
    response.status(201).send(`user unsubscribed`);
  });
};
const getXarpasByDistance = (request, response) => {
  let name,atype,d,p;
  try {
    let r = JSON.parse(request.body.json);
    p=r.p;
    name=r.name;
    atype=r.atype;
    d=r.d;
    //console.log(p)
  } catch (err) {
    name = "";
    atype = 0;
    d = 0;
    p = null;
  }

  if (!p) {
    response.status(200).json([]);
  }

  let q = `SELECT x.*,
  json_build_object('lat',ST_X(ST_TRANSFORM(ST_SetSRID(x.position,3857),4326)),
  'lng',ST_Y(ST_TRANSFORM(ST_SetSRID(x.position,3857),4326))
) as location
  FROM test.xarpas as x WHERE 
  ST_HausdorffDistance(
  ST_TRANSFORM(ST_SetSRID(ST_Point(${p.lat}::float,${p.lng}::float),4326),3857),
  x.position
    ) < ${d * 1000}`;
  if (name != "") {
    q += ` AND x.name ILIKE '%${name}%'`;
  }
  if (atype > 0) {
    q += ` AND x.atype=${atype}`;
  }
  //console.log(q)
  pool.query(q, (error, result) => {
    if (error) {
      throw error;
    }
    response.status(200).json(result.rows);
  });
};

const deleteFollower = (request, response) => {
  const id_follower = request.params.idfollower;
  const id_followed = request.params.idfollowed;
  let q = `DELETE FROM test.followers WHERE id_follower=${id_follower} AND id_followed=${id_followed}`;
  pool.query(q, (error, results) => {
    if (error) {
      throw error;
    }
    response.status(200).send(`Follower deleted `);
  });
};
const createFollower = (request, response) => {
  const { idfollower, idfollowed } = request.body;

  let q = `BEGIN;
      INSERT INTO test.followers (id_follower, id_followed) 
      VALUES (${idfollower}, ${idfollowed}) ON CONFLICT (id_follower, id_followed) DO NOTHING;
      INSERT INTO test.news (ntype,data,time,id_rel,id_user) VALUES 
      (4,'Tienes un nuevo seguidor',NOW(),${idfollower},${idfollowed});
      SELECT name,(SELECT tt2.token from test.users as tt2 where tt2.id=${idfollowed}) as token,avatar 
        FROM test.users WHERE id=${idfollower};
        COMMIT;`;

  pool.query(q, (error, result) => {
    /*if (error) {
      throw error;
    }*/
    if (result[3].rows.length > 0 && result[3].rows[0].name) {
      let uname = result[3].rows[0].name;
      let uavatar = result[3].rows[0].avatar;
      let utoken = result[3].rows[0].token;
      let sentence = "" + uname + " ha comenzado a seguirte";
      fcm.sendMessage(
        [utoken],
        "Nuevo seguidor",
        sentence,
        "user",
        idfollower,
        uavatar,
        "f" + idfollower
      );
    }
    response.status(201).send(`Follower Created`);
  });
};
const getFollowersByUser = (request, response) => {
  const id = request.params.id;
  let q = `SELECT * FROM test.followers f
    RIGHT JOIN test.users u ON f.id_follower=u.id WHERE f.id_followed=${id}`;
  pool.query(q, (error, result) => {
    if (error) {
      throw error;
    }
    response.status(200).json(result.rows);
  });
};
const getFollowedsByUser = (request, response) => {
  const id = request.params.id;
  let q = `SELECT * FROM test.followers f
    RIGHT JOIN test.users u ON f.id_followed=u.id WHERE f.id_follower=${id}`;
  pool.query(q, (error, result) => {
    if (error) {
      throw error;
    }
    response.status(200).json(result.rows);
  });
};
const updateBeacon = (request, response) => {
  const id = request.params.id;
  const input = JSON.stringify(request.body);

  let q = `
      BEGIN;
      SELECT msg FROM test.beacon WHERE id = ${id};
      INSERT INTO test.beacon as b (id, data,time) 
      VALUES (${id}, '${input}',NOW()) 
      ON CONFLICT (id) DO  
      UPDATE SET data='${input}',time=NOW(),msg='' WHERE b.id=${id} 
      RETURNING msg;
      COMMIT;`;

  pool.query(q, (error, result) => {
    if (error) {
      throw error;
    }
    //console.log(JSON.stringify(result));
    response.status(201).send(result);
  });
};
const messageBeacon = (request, response) => {
  const id = request.params.id;
  const input = JSON.stringify(request.body);

  let q = `UPDATE test.beacon as b SET msg=b.msg || '#${input}' WHERE b.id=${id}`;
  pool.query(q, (error, result) => {
    if (error) {
      throw error;
    }
    //console.log(result.rows);
    response.status(201).send("ok");
  });
};
const getBeacon = (request, response) => {
  const id = request.params.id;
  let q = `SELECT * FROM test.beacon b
    RIGHT JOIN test.users u ON b.id=u.id WHERE b.id=${id} AND b.time > (now() - interval '10 minutes')`;
  pool.query(q, (error, result) => {
    if (error) {
      throw error;
    }
    response.status(200).json(result.rows);
  });
};
const deleteBeacon = (request, response) => {
  const id = request.params.id;
  let q = `DELETE FROM test.beacon WHERE id=${id}`;
  pool.query(q, (error, results) => {
    if (error) {
      throw error;
    }
    response.status(200).send(`Beacon deleted `);
  });
};
const createRoute = (request, response) => {
  //APP
  const input = request.body;
  let end = input.end;
  if (!end.lat || end.lat == undefined) end = JSON.parse(input.end);
  let ini = input.ini;
  if (!ini.lat || ini.lat == undefined) ini = JSON.parse(input.ini);
  let q = `BEGIN;
        INSERT INTO test.routes (name,description,pointstart,pointend,atype,time,
          distance,asce,desce,altitude,owner,xarpa,path) 
        VALUES(
          ${escape(input.name)},${escape(input.description)},
          ST_TRANSFORM(ST_SetSRID(ST_Point(${ini.lng},${ini.lat}),4326),3857),
          ST_TRANSFORM(ST_SetSRID(ST_Point(${end.lng},${end.lat}),4326),3857),
          ${input.atype},'${input.date}',${input.distance},${input.asc},${
    input.desc
  },'${input.altitude}',
          ${input.owner},${input.xarpa},
          ST_TRANSFORM(ST_SetSRID(ST_GeomFromGeoJSON('${
            input.path
          }'),4326),3857)
          );
        INSERT INTO test.news (ntype,data,time,id_rel,id_user) 
          (SELECT 3,'Se ha creado una salida en una de tus Xarpas', NOW(),${
            input.xarpa
          },  
            xu.id_user FROM test.xarpasusers xu WHERE xu.id_xarpa=${input.xarpa}
            UNION
            SELECT 3,'Se ha creado una salida en una de tus Xarpas', NOW(),${
              input.xarpa
            },  
            x.owner FROM test.xarpas x WHERE x.id=${input.xarpa}
          );
          SELECT JSON_AGG(ROW_TO_JSON(u)) as json,xx.name,xx.image,(SELECT token FROM test.users WHERE id=xx.owner) as token,
(SELECT id FROM test.routes WHERE xarpa=${
    input.xarpa
  } ORDER BY id DESC LIMIT 1) as route
FROM test.xarpasusers as x JOIN test.users as u ON x.id_user=u.id 
JOIN test.xarpas as xx ON x.id_xarpa=xx.id WHERE id_xarpa=${
    input.xarpa
  } GROUP BY xx.name,xx.owner,xx.image;
          COMMIT;
        `;
  //console.log(q);
  pool.query(q, (error, result) => {
    if (error) {
      throw error;
    }
    if (result[3].rows.length > 0 && result[3].rows[0].json) {
      let json = result[3].rows[0].json;
      let users = [];
      for (let i = 0; i < json.length; i++) {
        if (json[i] && json[i].token) {
          users.push(json[i].token);
        }
      }
      users.push(result[3].rows[0].token);
      let sentence =
        "La xarpa " +
        result[3].rows[0].name +
        " ha creado una nueva ruta: " +
        input.name;
      fcm.sendMessage(
        users,
        "Nueva salida",
        sentence,
        "route",
        result[3].rows[0].route,
        result[3].rows[0].image,
        "r" + input.xarpa
      );
    }
    // console.log(result.row[0].id)
    response.status(201).send(`Route added with ID: ${result.insertId}`);
  });
};
const getRouteById = (request, response) => {
  const id = request.params.id;
  let q = `SELECT t.id as id,t.name as name, t.description as description, 
  t.distance,t.atype,t.time,ST_AsGeoJSON(ST_Transform (t.path , 4326)) as geometry,
  t.xarpa as xarpaid, x.name as xarpaname, 
  x.image as xarpaavatar, t.owner as owner,
  t.asce,t.desce,t.altitude as elevation,ARRAY_LENGTH(l.id_users,1) as likes,l.id_users::text[] as wholikes,
  COUNT(c.id_route) as comments,
  COUNT(ru.id_track) as whodidtheroute  
  FROM test.routes as t 
  LEFT JOIN test.rlikes as l ON l.id_route=t.id 
  LEFT JOIN test.rcomments as c ON c.id_route=t.id 
  LEFT JOIN test.xarpas as x ON t.xarpa=x.id
  LEFT JOIN test.routesusers as ru ON t.id=ru.id_route  
  WHERE t.id=${id}
  GROUP BY t.id,t.name,t.distance,t.atype,t.time,t.path,
  t.xarpa,t.asce,l.id_users,t.name,x.image,x.name,c.id_route,t.owner,t.altitude`;

  //console.log(q);
  pool.query(q, (error, results) => {
    //console.log(results.rows)
    if (error) {
      throw error;
    }
    response.status(200).json(results.rows);
  });
};
const deleteRoute = (request, response) => {
  const id = request.params.id;
  let q = `BEGIN;
  DELETE FROM test.routesusers WHERE id_route=${id}; 
  DELETE FROM test.rlikes WHERE id_route=${id}; 
  DELETE FROM test.rcomments WHERE id_route=${id}; 
  DELETE FROM test.news WHERE ntype=3 AND id_rel=${id};
  DELETE FROM test.routes WHERE id = ${id}; COMMIT;`;
  //console.log(q)
  pool.query(q, (error, results) => {
    if (error) {
      throw error;
    }
    response.status(200).send(`Route deleted with ID: ${id}`);
  });
};
const likeRoute = (request, response) => {
  const { idroute, iduser } = request.body;

  let q = `INSERT INTO test.rlikes as t (id_route, id_users) 
      VALUES (${idroute}, ARRAY[${iduser}])
      ON CONFLICT (id_route) DO UPDATE SET id_users =(select array_agg(distinct e) 
                              from unnest(t.id_users || EXCLUDED.id_users) e)`;
  //console.log(q)
  pool.query(q, (error, result) => {
    if (error) {
      throw error;
    }
    response.status(201).send(`User liked with ID: ${result.insertId}`);
  });
};
const unlikeRoute = (request, response) => {
  const idroute = request.params.idroute;
  const iduser = request.params.iduser;
  let q = `UPDATE test.rlikes SET id_users=array_remove(id_users, '${iduser}') WHERE id_route=${idroute}`;
  //console.log(q)
  pool.query(q, (error, result) => {
    if (error) {
      throw error;
    }
    response.status(201).send(`User liked with ID: ${result.insertId}`);
  });
};
const showLikesRoute = (request, response) => {
  const id = request.params.id;
  let q = `SELECT s.id_route,i.* AS idx
    FROM test.rlikes s
    LEFT JOIN test.users i ON i.id = ANY(s.id_users) WHERE s.id_route=${id}`;

  pool.query(q, (error, result) => {
    if (error) {
      throw error;
    }
    response.status(200).json(result.rows);
  });
};

const getCommentsRoute = (request, response) => {
  const id = request.params.id;
  let q = `SELECT c.*,u.id as userid,u.name as username, u.avatar as useravatar  FROM test.rcomments as c LEFT JOIN test.users as u ON c.id_user=u.id WHERE c.id_route=${id} ORDER BY c.time ASC`;

  pool.query(q, (error, result) => {
    if (error) {
      throw error;
    }
    response.status(200).json(result.rows);
  });
};

const commentRoute = (request, response) => {
  const { idroute, iduser, text } = request.body;

  let q = `INSERT into test.rcomments (id_route,id_user,text,time) VALUES (${idroute},${iduser},${escape(
    text
  )}, current_timestamp)`;

  pool.query(q, (error, result) => {
    if (error) {
      throw error;
    }
    response.status(201).send(`User liked with ID: ${result.insertId}`);
  });
};

const delcommentRoute = (request, response) => {
  //const id = parseInt(request.params.id);
  const id = request.params.id;

  pool.query(
    "DELETE FROM test.rcomments WHERE id = $1",
    [id],
    (error, results) => {
      if (error) {
        throw error;
      }
      response.status(200).send(`Comment deleted with ID: ${id}`);
    }
  );
};
getRoutes = (request, response) => {
  //console.log(request.body)
  let { xarpa, user, time, name, to, range, type, from } = request.body;
  if (time == null || time == "null") {
    time = "TO_TIMESTAMP(0)";
  }
  if (xarpa != null && xarpa != "null") {
    if (xarpa.legnth > 1) xarpa = xarpa.split(",");
    else xarpa = xarpa[0];
  } else {
    xarpa = null;
  }
  let order = "DESC";
  if (user && !xarpa) {
    order = "ASC";
  }
  if (user && !xarpa) {
    xarpa =
      "SELECT o.id_xarpa FROM test.xarpasusers as o WHERE o.id_user=" + user;
    xarpa += " UNION SELECT z.id FROM test.xarpas as z WHERE z.owner= " + user;
  }
  let page = parseInt(request.params.page);
  if (!page || page <= 0) {
    page = 1;
  }
  const limit = 5;
  const offset = (page - 1) * 5;

  let where = "";
  if (name && name.length > 0) {
    where += ` AND t.name ILIKE '%${name}%' `;
  }
  if (type && Number.parseInt(type) >= 0) {
    where += ` AND t.atype=${type} `;
  }
  if (range && Number.parseInt(range) > 0) {
    if (Number.parseInt(range) < 150) {
      where += ` AND t.distance<=${+range + 5} AND t.distance>=${range - 5} `;
    } else {
      where += ` AND t.distance>=${range} `;
    }
  }
  if (to && to != "" && from && from != "") {
    where += ` AND t.timeini>='${from}' AND t.timeini<='${to}'`;
  }

  let q = `SELECT DISTINCT(t.id) as id,t.name as name, t.description as description, 
  t.distance,t.atype,t.time,ST_AsGeoJSON(ST_Transform (t.path , 4326)) as geometry,
  t.xarpa as xarpaid, x.name as xarpaname, 
  x.image as xarpaavatar, t.owner as owner,
  t.asce,t.desce,t.altitude as elevation,ARRAY_LENGTH(l.id_users,1) as likes,l.id_users::text[] as wholikes,
  COUNT(c.id_route) as comments,
  COUNT(ru.id_track) as whodidtheroute  
  FROM test.routes as t 
  LEFT JOIN test.rlikes as l ON l.id_route=t.id 
  LEFT JOIN test.rcomments as c ON c.id_route=t.id 
  LEFT JOIN test.xarpas as x ON t.xarpa=x.id
  LEFT JOIN test.routesusers as ru ON t.id=ru.id_route  
  WHERE t.xarpa IN (${xarpa}) AND t.time > ${time} ${where}
  GROUP BY t.id,t.name,t.distance,t.atype,t.time,t.path,
  t.xarpa,t.asce,l.id_users,t.name,x.image,x.name,c.id_route,t.owner,t.altitude   
  ORDER BY t.time ${order} LIMIT ${limit} OFFSET ${offset};`;

  //console.log(q)

  pool.query(q, (error, results) => {
    if (error) {
      throw error;
    }
    //console.log(results.row)
    response.status(200).json(results.rows);
  });
};

//ELITE
const removeEliteFunction = (id) => {
  return new Promise((resolve, reject) => {
    let q = `BEGIN;`;
    q += `DELETE FROM test.coincidences WHERE id1=${id} OR id2=${id};`;
    q += `DELETE FROM test.awards WHERE id_activity=${id};`;
    q += `DELETE FROM test.pals WHERE id1=${id} OR id2=${id};`;
    q += `DELETE FROM test.routesusers WHERE id_track=${id};`;
    //FALTA ELIMINAR SEGMENTOS
    q += `COMMIT;`;
    pool.query(q, (error, result) => {
      if (error) {
        reject(error);
      }
      resolve(result);
    });
  });
};
const addEliteFunction = async (id) => {
  //console.log("UNO")
  await eliteFunction_whoBeatTheMark(id, null);
  //console.log("DOS")
  await eliteFunctions_whodidtheroute(id, null);
  //console.log("TRES")
  await eliteFunctions_whowasmypal(id, null);
  //console.log("CUATRO")
  //FALTA AÑADIR SEGMENTOS
};
const eliteFunction_whoBeatTheMark = (id) => {
  return new Promise((resolve, reject) => {
    let q = `
BEGIN;
INSERT INTO test.coincidences (id1,id2)
WITH data AS (
  SELECT t1.id as name,ST_SetSRID(t1.pointstart::geometry,3857) AS ini,
ST_SetSRID(t1.path::geometry,3857) AS geom,t1.atype as atype, 
t1.distance as distance,t1.owner as owner FROM test.track as t1 WHERE t1.id=${id}
)
SELECT ${id},tt1.id 
FROM test.track as tt1,data WHERE tt1.owner=data.owner AND 
tt1.atype=data.atype AND 
ABS(data.distance-tt1.distance)<data.distance*0.15 AND  
ST_DISTANCE(ST_SetSRID(tt1.pointstart,3857), data.ini) < data.distance*100 AND 
ST_FrechetDistance(ST_Simplify(data.geom,32), ST_Simplify(ST_SetSRID(tt1.path::geometry,3857),32)) <data.distance*100 
GROUP BY tt1.atype,tt1.id;
SELECT t.id,t.name,t.properties->>'time_ini',t.properties->>'time_total',u.token as token,t.average FROM test.coincidences as c INNER JOIN 
test.track as t ON c.id2=t.id INNER JOIN test.users as u ON t.owner=u.id WHERE (c.id1=${id} AND c.id2!=${id}) OR t.id=${id} ORDER BY t.average DESC LIMIT 4;
COMMIT`;
//console.log(q)
    pool.query(q, async (error, result) => {
      if (error) {
        reject(error);
      }
      //console.log(result[2].rows)
      //console.log(result[2].rows.length)
      if (result && result[2] && result[2].rows && result[2].rows.length > 1) {
        //console.log("____________________")
        //console.log(result[2].rows[0]);
        if (
          result[2].rows[0].id &&
          result[2].rows.length > 1 &&
          result[2].rows[0].id == id
        ) {
          await eliteFunctions_Award(id, 1, "{}", result[2].rows[0].token);
        } else if (
          result[2].rows[1] &&
          result[2].rows.length > 2 &&
          result[2].rows[1].id == id
        ) {
          await eliteFunctions_Award(id, 2, "{}", result[2].rows[1].token);
        } else if (
          result[2].rows[2] &&
          result[2].rows.length > 3 &&
          result[2].rows[2].id == id
        ) {
          await eliteFunctions_Award(id, 3, "{}", result[2].rows[2].token);
        }
      }
      resolve(result);
    });
  });
};
const eliteFunctions_Award = (id, wtype, data, token) => {
  //console.log("OJO QUE HAY PREMIO"+wtype)
  return new Promise((resolve, reject) => {
    let q = `INSERT INTO test.awards (id_activity,wtype,data) 
  VALUES(${id},${wtype},'${data}')`;
    pool.query(q, (error, result) => {
      if (error) {
        reject(error);
      }

      if (token && (wtype == 1 || wtype == 2 || wtype == 3)) {
        let sentence = "¡Felicidades! Has bátido tu tiempo en una actividad";
        if (wtype == 2) {
          sentence = "Has obtenido el segundo mejor tiempo en una actividad";
        }
        if (wtype == 3) {
          sentence = "Has optenido el tercer mejor tiempo en una actividad";
        }

        fcm.sendMessage(
          [token],
          "Nuevo Récord",
          sentence,
          "activity",
          id,
          "",
          "l" + id
        );
      }
      resolve(result);
    });
  });
};
const eliteFunctions_whowasmypal = (id, response) => {
  return new Promise((resolve, reject) => {
    let q = `INSERT INTO test.pals (id1,id2,owner1,owner2,name1,name2,avatar1,avatar2) 
  WITH data AS(
    SELECT t.id as id,distance,average,atype,timeini,pointstart,owner as ownerid,path,u.name as ownername, u.avatar as owneravatar, 
    to_jsonb(properties->>'track') AS geometry FROM test.track as t INNER JOIN test.users as u ON t.owner=u.id
    WHERE t.id=${id})
      SELECT tt1.id,data.id,tt1.owner,data.ownerid,ut.name,data.ownername,COALESCE(ut.avatar,''),COALESCE(data.owneravatar,'') 
          FROM data,test.track as tt1 RIGHT JOIN test.users as ut ON tt1.owner=ut.id WHERE tt1.owner!=data.ownerid AND  
          tt1.atype=data.atype AND tt1.timeini > data.timeini - INTERVAL '20 min' 
          AND tt1.timeini < data.timeini + INTERVAL '20 min' AND
          ST_DISTANCE(ST_SetSRID(tt1.pointstart,3857), data.pointstart) < 5000	 AND 
          ST_FrechetDistance(ST_Simplify(data.path,20), ST_Simplify(ST_SetSRID(tt1.path::geometry,3857),20)) <data.distance*150
      `;
    pool.query(q, (error, result) => {
      if (error) {
        reject(error);
      }
      resolve(result);
    });
  });
};
const eliteFunctions_whodidtheroute = (id, response) => {
  return new Promise((resolve, reject) => {
    let q = `
  INSERT INTO test.routesusers (id_route,id_track,time,timeini,timeend) 
  (
  WITH datasegmented AS(
    WITH datasegments AS(
        SELECT 
        segments.tid,
        segments.rid,
        segments.trackname,
        segments.td as trackdistance,
        segments.name as segmentname,
        segments.rd as segmentdistance,
        segments.path,
        segments.rpath,
        segments.pointstart,
        segments.pointend,
        segments.clipped
        from(
          select t.id as tid,r.id as rid,t.name as trackname,t.path,r.path as rpath,r.pointstart,r.pointend,t.distance as td,t.properties,r.name,r.distance as rd,
            ST_INTERSECTION(ST_SIMPLIFY(ST_makevalid(t.path),10),ST_BUFFER(ST_INTERSECTION(ST_SIMPLIFY(ST_makevalid (t.path),10),ST_BUFFER(ST_SIMPLIFY(r.path,10),15,'side=both endcap=flat')),1)) as clipped
          from test.routes as r
                inner join test.track as t on r.atype=t.atype,ST_DWithin(r.path,t.path,50)
                WHERE t.id=${id}
                AND r.xarpa IN (
                  SELECT xx.id_xarpa FROM test.xarpasusers as xx WHERE xx.id_user=t.owner
                  UNION
                  SELECT zz.id FROM test.xarpas as zz WHERE zz.owner=t.owner
                )
          AND r.atype=t.atype 
          
        AND t.timeini > r.time - INTERVAL '135 min' AND t.timeini < r.time + INTERVAL '105 min'
          )
        as segments 
        WHERE 
        ST_Dimension(segments.clipped)=1 
        AND 
        ST_Length(segments.clipped)>segments.rd*900 
        AND 
        segments.td>segments.rd
      )
    SELECT ds.tid,ds.rid,ds.pointstart,ds.pointend,ds.path,ds.rpath,ds.trackname,ds.segmentname,ds.segmentdistance,ST_LENGTH(ds.geom) as cl,
    ds.geom as geom
    FROM (
      SELECT datasegments.tid,datasegments.rid,datasegments.pointstart,datasegments.pointend,datasegments.path,
      datasegments.rpath,datasegments.trackname,datasegments.segmentname,
      datasegments.trackdistance,datasegments.segmentdistance,(ST_DUMP((SELECT st_makeline(geom) FROM ST_DUMP(datasegments.clipped)))).geom AS geom
         FROM datasegments
    )	as ds WHERE ST_LENGTH(ds.geom) > segmentdistance*999
  )
  SELECT
    finalsegment.rid as id_route,finalsegment.tid as id_track,
    ROUND(ST_Z(ST_EndPoint(finalsegment.geom))-ST_Z(ST_StartPoint(finalsegment.geom))) as time,
    ST_Z(ST_StartPoint(finalsegment.geom)) as timeini,
    ST_Z(ST_EndPoint(finalsegment.geom)) as timeend
  FROM (
    SELECT dss.tid,dss.rid,dss.pointstart,dss.pointend,dss.trackname,dss.segmentname,dss.geom as geom,
    dss.path
         FROM datasegmented as dss 
  ) as finalsegment  WHERE ST_DISTANCE(ST_StartPoint(ST_FORCE2d(finalsegment.geom)),finalsegment.pointstart)<1000
  );
  SELECT r.id as idroute,r.name as name,u.name as user,u.token as token,x.id as xarpa FROM test.routesusers as ru 
		INNER JOIN test.routes as r ON ru.id_route=r.id 
		INNER JOIN test.xarpas as x ON r.xarpa=x.id 
		INNER JOIN test.track as t ON ru.id_track=t.id 
		INNER JOIN test.users as u ON t.owner=u.id
		WHERE ru.id_track=${id}
  `;
    //CONSOLE A NOTIFICAR
    //console.log(q)
    pool.query(q, (error, result) => {
      if (error) {
        reject(error);
      }

      if (
        result[1] &&
        result[1].rows &&
        result[1].rows.length > 0 &&
        result[1].rows[0].name &&
        result[1].rows[0].token &&
        result[1].rows[0].idroute &&
        result[1].rows[0].xarpa
      ) {
        let sentence =
          "¡Felicidades! Has completado la ruta: " + result[1].rows[0].name;
        let user = result[1].rows[0].token;
        fcm.sendMessage(
          [user],
          "Ruta Completada",
          sentence,
          "route",
          result[1].rows[0].idroute,
          "",
          "r" + result[1].rows[0].xarpa
        );
      }
      resolve(response);
    });
  });
};
const eliteFunctions_whodidthesegment = (id, response) => {
  return new Promise((resolve, reject) => {
    let q = `
  INSERT INTO test.segmentsusers (id_segment,id_track,time,timeini,timeend) 
  (
  WITH datasegmented AS(
    WITH datasegments AS(
        SELECT 
        segments.tid,
        segments.rid,
        segments.trackname,
        segments.td as trackdistance,
        segments.name as segmentname,
        segments.rd as segmentdistance,
        segments.path,
        segments.rpath,
        segments.pointstart,
        segments.pointend,
        segments.clipped
        from(
          select t.id as tid,r.id as rid,t.name as trackname,t.path,r.path as rpath,r.pointstart,r.pointend,t.distance as td,t.properties,r.name,r.distance as rd,
            ST_INTERSECTION(ST_SIMPLIFY(ST_makevalid(t.path),10),ST_BUFFER(ST_INTERSECTION(ST_SIMPLIFY(ST_makevalid (t.path),10),ST_BUFFER(ST_SIMPLIFY(r.path,10),15,'side=both endcap=flat')),1)) as clipped
          from test.segments as r
                inner join test.track as t on r.atype=t.atype,ST_DWithin(r.path,t.path,50)
                WHERE t.id=${id}
          AND r.atype=t.atype 
          )
        as segments 
        WHERE 
        ST_Dimension(segments.clipped)=1 
        AND 
        ST_Length(segments.clipped)>segments.rd*900 
        AND 
        segments.td>segments.rd
      )
    SELECT ds.tid,ds.rid,ds.pointstart,ds.pointend,ds.path,ds.rpath,ds.trackname,ds.segmentname,ds.segmentdistance,ST_LENGTH(ds.geom) as cl,
    ds.geom as geom
    FROM (
      SELECT datasegments.tid,datasegments.rid,datasegments.pointstart,datasegments.pointend,datasegments.path,
      datasegments.rpath,datasegments.trackname,datasegments.segmentname,
      datasegments.trackdistance,datasegments.segmentdistance,(ST_DUMP((SELECT st_makeline(geom) FROM ST_DUMP(datasegments.clipped)))).geom AS geom
         FROM datasegments
    )	as ds WHERE ST_LENGTH(ds.geom) > segmentdistance*999
  )
  SELECT
    finalsegment.rid as id_segment,finalsegment.tid as id_track,
    ROUND(ST_Z(ST_EndPoint(finalsegment.geom))-ST_Z(ST_StartPoint(finalsegment.geom))) as time,
    ST_Z(ST_StartPoint(finalsegment.geom)) as timeini,
    ST_Z(ST_EndPoint(finalsegment.geom)) as timeend
  FROM (
    SELECT dss.tid,dss.rid,dss.pointstart,dss.pointend,dss.trackname,dss.segmentname,dss.geom as geom,
    dss.path
         FROM datasegmented as dss 
  ) as finalsegment  WHERE ST_DISTANCE(ST_StartPoint(ST_FORCE2d(finalsegment.geom)),finalsegment.pointstart)<1000
  );
  SELECT r.id as idsegment,r.name as name,u.name as user,u.token as token,x.id as xarpa FROM test.segmentssusers as ru 
		INNER JOIN test.routes as r ON ru.id_segment=r.id 
		INNER JOIN test.track as t ON ru.id_track=t.id 
		INNER JOIN test.users as u ON t.owner=u.id
		WHERE ru.id_track=${id}
  `;
    //CONSOLE A NOTIFICAR
    //console.log(q)
    pool.query(q, (error, result) => {
      if (error) {
        reject(error);
      }

      if (
        result[1] &&
        result[1].rows &&
        result[1].rows.length > 0 &&
        result[1].rows[0].name &&
        result[1].rows[0].token &&
        result[1].rows[0].idroute &&
        result[1].rows[0].xarpa
      ) {
        let sentence =
          "¡Felicidades! Has completado la ruta: " + result[1].rows[0].name;
        let user = result[1].rows[0].token;
        fcm.sendMessage(
          [user],
          "Ruta Completada",
          sentence,
          "route",
          result[1].rows[0].idroute,
          "",
          "r" + result[1].rows[0].xarpa
        );
      }
      resolve(response);
    });
  });
};
const whodidtheRoute = (request, response) => {
  const id = request.params.id;
  let q = `SELECT t.id as idtrack,r.distance,ru.time,u.id,u.name,u.avatar,t.atype  
    FROM test.routesusers ru
    LEFT JOIN test.track as t ON ru.id_track=t.id 
    LEFT JOIN test.routes as r ON r.id=ru.id_route 
    LEFT JOIN test.users u ON u.id = t.owner WHERE ru.id_route=${id} ORDER BY ru.time ASC`;

  pool.query(q, (error, result) => {
    if (error) {
      throw error;
    }
    response.status(200).json(result.rows);
  });
};

const getNewsByUser = (request, response) => {
  const id = request.params.id;
  let q = `SELECT * FROM test.news n WHERE n.id_user=${id} ORDER BY n.time ASC`;

  pool.query(q, (error, result) => {
    if (error) {
      throw error;
    }
    let q2 = `
      DELETE FROM test.news n WHERE n.id_user=${id}
    `;
    pool.query(q2, (error2, result2) => {
      if (error2) {
        throw error2;
      }
      response.status(200).json(result.rows);
    });
  });
};
module.exports = {
  getActivities,
  getActivityById,
  createActivity,
  updateActivity,
  deleteActivity,
  getActivityByOwner,
  getOneActivityById, //simplify
  getActivityContacts,
  getPictureFromActivity,
  likeActivity,
  showLikes,
  getCommentsActitivity,
  commentActivity,
  delcommentActivity,
  createUser,
  updateToken,
  getUser,
  getUserProfile,
  getUserByName,
  getContactsByUser,
  updateUser,
  createXarpa,
  subscribeXarpa,
  unsubscribeXarpa,
  getXarpas,
  getXarpaProfile,
  updateXarpa,
  getXarpasByDistance,
  deleteFollower,
  createFollower,
  getFollowersByUser,
  getFollowedsByUser,
  updateBeacon,
  messageBeacon,
  getBeacon,
  deleteBeacon,
  createRoute,
  getRoutes,
  getRouteById,
  deleteRoute,
  likeRoute,
  unlikeRoute,
  showLikesRoute,
  getCommentsRoute,
  commentRoute,
  delcommentRoute,
  whodidtheRoute,
  getNewsByUser,
};
