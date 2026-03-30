import React, { useEffect, useState } from 'react';
import axios from 'axios';

const ViewUserTable = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        axios.get('http://localhost:8000/api/users')
            .then(response => {
                setUsers(response.data);
                setLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
    }, []);

    return (
        <div>
            {users.map((user: any) => (
                <div key={user._id}>
                    <div className="mb-4">
                        <p>{user.email}</p>
                        <p>{user.role}</p>
                    </div>
                </div>
            ))}
        </div>
    )
}

export default ViewUserTable;

